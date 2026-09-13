import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { DateTime } from 'luxon';
import pino from 'pino';
import * as nhlClient from '../nhl/client.js';
import { getGuildConfig, hasDailyCardBeenPosted, markDailyCardPosted } from '../db/queries.js';
import { getTeamEmoji } from './goalCard.js';
import type { ScheduleGame, TeamStanding } from '../nhl/types.js';

const logger = pino({ name: 'daily-card-service' });
const POLL_INTERVAL_MS = 60_000;
const DEFAULT_ZONE = 'America/Denver';
const CARD_COLOR = 0x006847;

let timer: ReturnType<typeof setInterval> | null = null;

export function startDailyCardService(client: Client): void {
  if (timer) return;
  logger.info('Starting daily card service');
  timer = setInterval(() => tick(client), POLL_INTERVAL_MS);
  tick(client);
}

export function stopDailyCardService(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Stopped daily card service');
  }
}

async function tick(client: Client): Promise<void> {
  logger.debug('Daily card scheduler tick');
  for (const [guildId] of client.guilds.cache) {
    try {
      await processGuild(client, guildId);
    } catch (err) {
      logger.error({ err, guildId }, 'Error processing daily card for guild');
    }
  }
}

async function processGuild(client: Client, guildId: string): Promise<void> {
  const config = getGuildConfig(guildId);
  if (!config?.gameday_channel_id || !config.daily_card_enabled) return;

  const zone = config.timezone || DEFAULT_ZONE;
  const now = DateTime.now().setZone(zone);
  const todayISO = now.toISODate();
  if (!todayISO) return;

  if (now.hour < config.daily_card_hour) return;
  if (hasDailyCardBeenPosted(guildId, todayISO)) return;

  const scheduleResponse = await nhlClient.getSchedule(config.primary_team);
  if (!scheduleResponse) {
    // Transient NHL API failure (fetchJson already retried 3x). Don't claim the day —
    // a genuinely empty/off-season schedule is handled below, but this isn't that; we
    // want to retry next tick instead of silently suppressing today's card.
    logger.warn({ guildId }, 'Schedule unavailable, will retry next tick');
    return;
  }

  const games = scheduleResponse.games ?? [];
  const selection = selectDailyCard(games, todayISO, zone);
  if (selection.kind === 'none') {
    // Nothing to post (off-season), but claim the day so we don't refetch the schedule
    // on every tick until a real game shows up.
    markDailyCardPosted(guildId, todayISO);
    return;
  }

  // Skip a stale pre-game card if the bot was down past puck drop — the game is already
  // live/final by the time we notice it. Still claim the day so we don't retry every tick.
  if (selection.kind === 'game' && selection.game.gameState !== 'FUT' && selection.game.gameState !== 'PRE') {
    markDailyCardPosted(guildId, todayISO);
    logger.info({ guildId, gameState: selection.game.gameState }, 'Skipping stale pre-game card; game already underway');
    return;
  }

  // Claim before posting so a slow post (or a second overlapping tick) can't double-post.
  if (!markDailyCardPosted(guildId, todayISO)) return;

  try {
    const channel = await client.channels.fetch(config.gameday_channel_id);
    if (!channel || !channel.isTextBased()) {
      logger.error({ guildId, channelId: config.gameday_channel_id }, 'Gameday channel not found for daily card');
      return;
    }

    const guild = client.guilds.cache.get(guildId);

    let embed: EmbedBuilder;
    if (selection.kind === 'game') {
      const standingsResponse = await nhlClient.getStandings();
      embed = buildPreGameCard(selection.game, games, config.primary_team, standingsResponse?.standings ?? null, guild);
    } else {
      const phrase = pickOffDayPhrase(todayISO);
      embed = buildOffDayCard(phrase, selection.nextGame, config.primary_team);
    }

    await (channel as TextChannel).send({ embeds: [embed] });
    logger.info({ guildId, kind: selection.kind }, 'Daily card posted');
  } catch (err) {
    logger.error({ err, guildId }, 'Failed to post daily card');
  }
}

// --- Pure decision logic ---

export type DailyCardSelection =
  | { kind: 'game'; game: ScheduleGame }
  | { kind: 'offday'; nextGame?: ScheduleGame }
  | { kind: 'none' };

/** In-season game types: 2 = regular season, 3 = playoffs. Preseason (1) doesn't count. */
const IN_SEASON_GAME_TYPES = new Set([2, 3]);

export function selectDailyCard(games: ScheduleGame[], todayISO: string, zone: string): DailyCardSelection {
  const gameToday = games.find(
    g => DateTime.fromISO(g.startTimeUTC, { zone: 'utc' }).setZone(zone).toISODate() === todayISO
  );
  if (gameToday) {
    return { kind: 'game', game: gameToday };
  }

  const seasonGames = games.filter(g => IN_SEASON_GAME_TYPES.has(g.gameType));
  const hasPastSeasonGame = seasonGames.some(g => g.gameDate <= todayISO);
  const hasFutureSeasonGame = seasonGames.some(g => g.gameDate >= todayISO);

  if (!hasPastSeasonGame || !hasFutureSeasonGame) {
    return { kind: 'none' };
  }

  const upcoming = games
    .filter(g => g.gameDate > todayISO)
    .sort((a, b) => (a.gameDate < b.gameDate ? -1 : a.gameDate > b.gameDate ? 1 : 0));

  return { kind: 'offday', nextGame: upcoming[0] };
}

export const OFF_DAY_PHRASES: string[] = [
  'No game today. Touch grass.',
  'Off day. Go outside.',
  'No hockey tonight. Get a hobby.',
  'Rest day. Hydrate.',
  'Nothing on the schedule. Call your mom.',
  'No game today. Read a book or something.',
  'Day off. Stretch. Nap. Repeat.',
  'No puck drop tonight. Go for a walk.',
  "Off night. Do the dishes you've been avoiding.",
  "No game. Take a break. We'll be here tomorrow.",
];

export function pickOffDayPhrase(todayISO: string): string {
  const dayOfYear = DateTime.fromISO(todayISO).ordinal;
  return OFF_DAY_PHRASES[dayOfYear % OFF_DAY_PHRASES.length];
}

export interface SeasonSeriesRecord {
  wins: number;
  losses: number;
  otLosses: number;
}

/** Season series (regular season only) for `primaryTeam` against `opponent`, from completed games. */
export function calculateSeasonSeries(
  games: ScheduleGame[],
  primaryTeam: string,
  opponent: string
): SeasonSeriesRecord {
  const record: SeasonSeriesRecord = { wins: 0, losses: 0, otLosses: 0 };

  for (const g of games) {
    if (g.gameType !== 2) continue;
    if (g.gameState !== 'FINAL' && g.gameState !== 'OFF') continue;

    const isHome = g.homeTeam.abbrev === primaryTeam;
    const isAway = g.awayTeam.abbrev === primaryTeam;
    if (!isHome && !isAway) continue;

    const opponentAbbrev = isHome ? g.awayTeam.abbrev : g.homeTeam.abbrev;
    if (opponentAbbrev !== opponent) continue;

    const primaryScore = isHome ? g.homeTeam.score : g.awayTeam.score;
    const opponentScore = isHome ? g.awayTeam.score : g.homeTeam.score;
    if (primaryScore == null || opponentScore == null) continue;

    if (primaryScore > opponentScore) {
      record.wins++;
    } else {
      const lastPeriodType = g.gameOutcome?.lastPeriodType;
      if (lastPeriodType === 'OT' || lastPeriodType === 'SO') {
        record.otLosses++;
      } else {
        record.losses++;
      }
    }
  }

  return record;
}

function formatSeasonSeries(record: SeasonSeriesRecord): string {
  return `${record.wins}-${record.losses}-${record.otLosses}`;
}

// --- Embed builders ---

function formatStreak(standing: TeamStanding | undefined): string {
  if (!standing) return '';
  if (standing.streakCode === 'OT') return 'OT';
  return `${standing.streakCode}${standing.streakCount}`;
}

function formatRecordLine(abbrev: string, standing: TeamStanding | undefined): string | null {
  if (!standing) return null;
  return `**${abbrev}**: GP:${standing.gamesPlayed} W:${standing.wins} L:${standing.losses} OT:${standing.otLosses} PTS:${standing.points} S:${formatStreak(standing)}`;
}

export function buildPreGameCard(
  game: ScheduleGame,
  seasonGames: ScheduleGame[],
  primaryTeam: string,
  standings: TeamStanding[] | null,
  guild?: Guild
): EmbedBuilder {
  const homeEmoji = getTeamEmoji(game.homeTeam.abbrev, guild);
  const awayEmoji = getTeamEmoji(game.awayTeam.abbrev, guild);

  const lines: string[] = [`${awayEmoji} **${game.awayTeam.abbrev}** @ **${game.homeTeam.abbrev}** ${homeEmoji}`, ''];

  const homeStanding = standings?.find(s => s.teamAbbrev.default === game.homeTeam.abbrev);
  const awayStanding = standings?.find(s => s.teamAbbrev.default === game.awayTeam.abbrev);
  const awayRecordLine = formatRecordLine(game.awayTeam.abbrev, awayStanding);
  const homeRecordLine = formatRecordLine(game.homeTeam.abbrev, homeStanding);
  if (awayRecordLine) lines.push(awayRecordLine);
  if (homeRecordLine) lines.push(homeRecordLine);
  lines.push('');

  const unixSeconds = Math.floor(new Date(game.startTimeUTC).getTime() / 1000);
  lines.push(`**Puck drop:** <t:${unixSeconds}:t>`);
  lines.push(`**Venue:** ${game.venue.default}`);

  if (game.tvBroadcasts && game.tvBroadcasts.length > 0) {
    const networks = game.tvBroadcasts.map(tv => tv.network).join(', ');
    lines.push(`**TV:** ${networks}`);
  }

  const isHome = game.homeTeam.abbrev === primaryTeam;
  const isAway = game.awayTeam.abbrev === primaryTeam;
  if (isHome || isAway) {
    const opponent = isHome ? game.awayTeam.abbrev : game.homeTeam.abbrev;
    const series = calculateSeasonSeries(seasonGames, primaryTeam, opponent);
    const gamesPlayed = series.wins + series.losses + series.otLosses;
    if (gamesPlayed > 0) {
      lines.push(`**Season series:** ${formatSeasonSeries(series)}`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Game day!')
    .setDescription(lines.join('\n'))
    .setColor(CARD_COLOR);

  const thumbnail = isHome ? game.homeTeam.logo : isAway ? game.awayTeam.logo : undefined;
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

export function buildOffDayCard(
  phrase: string,
  nextGame: ScheduleGame | undefined,
  primaryTeam: string
): EmbedBuilder {
  const lines: string[] = [phrase];

  if (nextGame) {
    const unixSeconds = Math.floor(new Date(nextGame.startTimeUTC).getTime() / 1000);
    lines.push('');
    lines.push(`**Next game:** ${nextGame.awayTeam.abbrev} @ ${nextGame.homeTeam.abbrev} — <t:${unixSeconds}:F>`);
  }

  const embed = new EmbedBuilder()
    .setTitle('No game today')
    .setDescription(lines.join('\n'))
    .setColor(CARD_COLOR);

  if (nextGame) {
    const isHome = nextGame.homeTeam.abbrev === primaryTeam;
    const isAway = nextGame.awayTeam.abbrev === primaryTeam;
    const thumbnail = isHome ? nextGame.homeTeam.logo : isAway ? nextGame.awayTeam.logo : undefined;
    if (thumbnail) embed.setThumbnail(thumbnail);
  }

  return embed;
}
