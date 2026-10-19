import { AttachmentBuilder, Client, MessageCreateOptions, TextChannel } from 'discord.js';
import { DateTime } from 'luxon';
import pino from 'pino';
import * as nhlClient from '../nhl/client.js';
import { getGuildConfig } from '../db/queries.js';
import type { ShiftChartRow, BoxscoreTeamPlayers, ScheduleGame } from '../nhl/types.js';
import { buildToiSvg, renderPng } from './toiRender.js';
import { normalizeShifts, hasOpenShifts, isShiftDataComplete, computeFiveOnFive, orderPlayers } from './toiChart.js';
import type { ChartPlayer } from './toiChart.js';
import type { ToiChartInput } from './toiRender.js';

const logger = pino({ name: 'toi-post' });

/** One side of a boxscore: abbreviation + its players. */
export interface BoxTeam extends BoxscoreTeamPlayers {
  abbrev: string;
}

function toSeconds(mmss: string): number {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
}

function chartPlayers(team: BoxTeam): ChartPlayer[] {
  return [
    ...team.forwards.map(p => ({ id: p.playerId, label: p.name.default, position: 'F' as const })),
    ...team.defense.map(p => ({ id: p.playerId, label: p.name.default, position: 'D' as const })),
  ];
}

/**
 * Chart input for `teamCode` (rows) vs its opponent (columns), or null if the team isn't
 * in this game, or 'incomplete' while shift data doesn't yet match the boxscore.
 */
export function toiChartInputFromGame(
  rows: ShiftChartRow[],
  home: BoxTeam,
  away: BoxTeam,
  teamCode: string
): ToiChartInput | 'incomplete' | null {
  const us = home.abbrev === teamCode ? home : away.abbrev === teamCode ? away : null;
  if (!us) return null;
  const them = us === home ? away : home;

  const shifts = normalizeShifts(rows);
  const skaters = [home, away].flatMap(t => [...t.forwards, ...t.defense]);
  const boxToi = new Map(skaters.map(p => [p.playerId, toSeconds(p.toi)]));
  if (!isShiftDataComplete(shifts, boxToi, hasOpenShifts(rows))) return 'incomplete';

  const goalieIds = new Set([...home.goalies, ...away.goalies].map(g => g.playerId));
  const five = computeFiveOnFive(shifts, goalieIds, us.abbrev, them.abbrev);
  const ours = orderPlayers(chartPlayers(us), five);
  const theirs = orderPlayers(chartPlayers(them), five);

  return {
    rows: [...ours.forwards, ...ours.defense],
    cols: [...theirs.forwards, ...theirs.defense],
    rowDividerAfter: ours.forwards.length,
    colDividerAfter: theirs.forwards.length,
    seconds: (rowId, colId) => five.against.get(`${rowId}-${colId}`) ?? 0,
    teamCode,
  };
}

export function toiChartTitle(awayAbbrev: string, homeAbbrev: string, gameDate: string): string {
  return `⏱️ Time against opponents · ${awayAbbrev} @ ${homeAbbrev} · ${DateTime.fromISO(gameDate).toFormat('LLL d')}`;
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

/** Fetch, check and render. null if the game can't be loaded or doesn't involve the team. */
export async function loadToiChart(gameId: number, teamCode: string): Promise<{ png: Buffer; title: string } | 'incomplete' | null> {
  const [shifts, box] = await Promise.all([nhlClient.getShiftChart(gameId), nhlClient.getBoxscore(gameId)]);
  if (!shifts || !box?.playerByGameStats) return null;
  const input = toiChartInputFromGame(
    shifts.data,
    { abbrev: box.homeTeam.abbrev, ...box.playerByGameStats.homeTeam },
    { abbrev: box.awayTeam.abbrev, ...box.playerByGameStats.awayTeam },
    teamCode
  );
  if (input === null || input === 'incomplete') return input;
  return {
    png: renderPng(buildToiSvg(input)),
    title: toiChartTitle(box.awayTeam.abbrev, box.homeTeam.abbrev, box.gameDate ?? ''),
  };
}

export function toiMessage(chart: { png: Buffer; title: string }, gameId: number): MessageCreateOptions {
  return { content: `**${chart.title}**`, files: [new AttachmentBuilder(chart.png, { name: `toi-${gameId}.png` })] };
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
