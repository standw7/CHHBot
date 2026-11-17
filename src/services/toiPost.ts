import { AttachmentBuilder, Client, MessageCreateOptions, TextChannel } from 'discord.js';
import { DateTime } from 'luxon';
import pino from 'pino';
import * as nhlClient from '../nhl/client.js';
import { getGuildConfig } from '../db/queries.js';
import type { ShiftChartRow, BoxscoreTeamPlayers, ScheduleGame } from '../nhl/types.js';
import { buildToiSvg, buildLinesSvg, renderPng } from './toiRender.js';
import { normalizeShifts, hasOpenShifts, isShiftDataComplete, computeFiveOnFive, orderPlayers } from './toiChart.js';
import type { ChartPlayer } from './toiChart.js';
import type { ToiChartInput, LinesChartInput } from './toiRender.js';
import { fetchShiftReports } from './toiHtmlReport.js';

const logger = pino({ name: 'toi-post' });

/** One side of a boxscore: abbreviation + its players. */
export interface BoxTeam extends BoxscoreTeamPlayers {
  abbrev: string;
}

function toSeconds(mmss: string): number {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
}

/** Boxscore TOI "08:12" -> "8:12". */
export function formatToi(mmss: string): string {
  return mmss.replace(/^0(?=\d:)/, '');
}

function chartPlayers(team: BoxTeam): ChartPlayer[] {
  return [
    ...team.forwards.map(p => ({ id: p.playerId, label: p.name.default, position: 'F' as const, toi: formatToi(p.toi) })),
    ...team.defense.map(p => ({ id: p.playerId, label: p.name.default, position: 'D' as const, toi: formatToi(p.toi) })),
  ];
}

/** Both post-game charts' inputs, from one pass over the shift data. */
export interface ToiChartInputs {
  against: ToiChartInput;
  lines: LinesChartInput;
}

/** Sizes of consecutive groups of `size` (the last one may be short), as orderPlayers builds them. */
function chunkSizes(count: number, size: number): number[] {
  const out: number[] = [];
  for (let left = count; left > 0; left -= size) out.push(Math.min(size, left));
  return out;
}

/**
 * Chart inputs for `teamCode`: time against its opponent (our rows × their columns) and our
 * line pairings (our skaters × our skaters). null if the team isn't in this game, or
 * 'incomplete' while shift data doesn't yet match the boxscore.
 */
export function toiChartInputFromGame(
  rows: ShiftChartRow[],
  home: BoxTeam,
  away: BoxTeam,
  teamCode: string
): ToiChartInputs | 'incomplete' | null {
  const us = home.abbrev === teamCode ? home : away.abbrev === teamCode ? away : null;
  if (!us) return null;
  const them = us === home ? away : home;

  const shifts = normalizeShifts(rows);
  // Goalies too: a 5v5 second needs one goalie per side, so a missing goalie shift would shorten the chart
  const everyone = [home, away].flatMap(t => [...t.forwards, ...t.defense, ...t.goalies]);
  const boxToi = new Map(everyone.map(p => [p.playerId, toSeconds(p.toi)]));
  if (!isShiftDataComplete(shifts, boxToi, hasOpenShifts(rows))) return 'incomplete';

  const goalieIds = new Set([...home.goalies, ...away.goalies].map(g => g.playerId));
  const five = computeFiveOnFive(shifts, goalieIds, us.abbrev, them.abbrev);
  const ours = orderPlayers(chartPlayers(us), five);
  const theirs = orderPlayers(chartPlayers(them), five);

  // Our rows: forwards, then defense, each sorted by total game TOI (the number on the right edge), most first
  const byToi = (players: ChartPlayer[]) => [...players].sort((a, b) => (boxToi.get(b.id) ?? 0) - (boxToi.get(a.id) ?? 0));

  return {
    against: {
      rows: [...byToi(ours.forwards), ...byToi(ours.defense)],
      cols: [...theirs.forwards, ...theirs.defense],
      rowDividerAfter: ours.forwards.length,
      colDividerAfter: theirs.forwards.length,
      seconds: (rowId, colId) => five.against.get(`${rowId}-${colId}`) ?? 0,
      teamCode,
    },
    // Line order as grouped (not by TOI) so trios and pairs sit as blocks on the diagonal
    lines: {
      players: [...ours.forwards, ...ours.defense],
      dividerAfter: ours.forwards.length,
      blocks: [...chunkSizes(ours.forwards.length, 3), ...chunkSizes(ours.defense.length, 2)],
      together: (a, b) => five.together.get(`${Math.min(a, b)}-${Math.max(a, b)}`) ?? 0,
      toi: id => five.toi.get(id) ?? 0,
      teamCode,
    },
  };
}

function matchup(awayAbbrev: string, homeAbbrev: string, gameDate: string): string {
  return `${awayAbbrev} @ ${homeAbbrev} · ${DateTime.fromISO(gameDate).toFormat('LLL d')}`;
}

export function toiChartTitle(awayAbbrev: string, homeAbbrev: string, gameDate: string): string {
  return `⏱️ Time against opponents · ${matchup(awayAbbrev, homeAbbrev, gameDate)}`;
}

export function linesChartTitle(awayAbbrev: string, homeAbbrev: string, gameDate: string): string {
  return `🤝 Line combinations · ${matchup(awayAbbrev, homeAbbrev, gameDate)}`;
}

export interface RenderedChart {
  png: Buffer;
  title: string;
}

/** The post-game TOI charts: time against opponents, then line combinations. */
export interface ToiCharts {
  against: RenderedChart;
  lines: RenderedChart;
}

/** Latest finished regular-season or playoff game, or null. */
export function pickLatestCompletedGame(games: ScheduleGame[]): number | null {
  const done = games
    .filter(g => (g.gameType === 2 || g.gameType === 3) && (g.gameState === 'OFF' || g.gameState === 'FINAL'))
    .sort((a, b) => b.startTimeUTC.localeCompare(a.startTimeUTC));
  return done[0]?.id ?? null;
}

export async function latestCompletedGameId(teamCode: string): Promise<number | null> {
  const schedule = await nhlClient.getSchedule(teamCode);
  return schedule ? pickLatestCompletedGame(schedule.games ?? []) : null;
}

/**
 * Fetch, check and render both charts. null if the game can't be loaded or doesn't involve the team.
 * Uses the shiftcharts API, falling back to the HTML shift reports when the API's data
 * is missing or incomplete (the API is never populated for some games).
 */
export async function loadToiChart(gameId: number, teamCode: string): Promise<ToiCharts | 'incomplete' | null> {
  const [shifts, box] = await Promise.all([nhlClient.getShiftChart(gameId), nhlClient.getBoxscore(gameId)]);
  if (!box?.playerByGameStats) return null;
  const home: BoxTeam = { abbrev: box.homeTeam.abbrev, ...box.playerByGameStats.homeTeam };
  const away: BoxTeam = { abbrev: box.awayTeam.abbrev, ...box.playerByGameStats.awayTeam };

  let input = shifts ? toiChartInputFromGame(shifts.data, home, away, teamCode) : 'incomplete';
  if (input === 'incomplete' || (shifts?.data.length ?? 0) === 0) {
    const everyone = (t: BoxTeam) => [...t.forwards, ...t.defense, ...t.goalies];
    const rows = await fetchShiftReports(gameId, { abbrev: home.abbrev, players: everyone(home) }, { abbrev: away.abbrev, players: everyone(away) });
    if (rows && rows.length > 0) {
      const fromReports = toiChartInputFromGame(rows, home, away, teamCode);
      if (fromReports !== 'incomplete') {
        if (fromReports) logger.info({ gameId }, 'Using HTML shift reports for TOI chart');
        input = fromReports;
      }
    }
  }
  if (input === null || input === 'incomplete') return input;
  const [awayAbbrev, homeAbbrev, date] = [box.awayTeam.abbrev, box.homeTeam.abbrev, box.gameDate ?? ''];
  return {
    against: { png: renderPng(buildToiSvg(input.against)), title: toiChartTitle(awayAbbrev, homeAbbrev, date) },
    lines: { png: renderPng(buildLinesSvg(input.lines)), title: linesChartTitle(awayAbbrev, homeAbbrev, date) },
  };
}

/** One message, both charts: titles in image order. */
export function toiMessage(charts: ToiCharts, gameId: number): MessageCreateOptions {
  return {
    content: `**${charts.against.title}**\n**${charts.lines.title}**`,
    files: [
      new AttachmentBuilder(charts.against.png, { name: `toi-${gameId}.png` }),
      new AttachmentBuilder(charts.lines.png, { name: `lines-${gameId}.png` }),
    ],
  };
}

/** Send to the guild's news and gameday channels (whichever are configured). */
export async function postToChannels(client: Client, guildId: string, payload: MessageCreateOptions): Promise<void> {
  const config = getGuildConfig(guildId);
  for (const channelId of [config?.news_channel_id, config?.gameday_channel_id]) {
    if (!channelId) continue;
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isTextBased()) await (channel as TextChannel).send(payload);
    } catch (error) {
      logger.error({ error, guildId, channelId }, 'Failed to post chart');
    }
  }
}
