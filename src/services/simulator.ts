import { Client, TextChannel } from 'discord.js';
import pino from 'pino';
import { getDb } from '../db/database.js';
import { getGuildConfig, hasGoalBeenPosted, markGoalPosted, hasFinalBeenPosted, markFinalPosted, hasGameStartBeenPosted, markGameStartPosted } from '../db/queries.js';
import { getTeamEmoji } from './goalCard.js';
import { EmbedBuilder } from 'discord.js';
import { buildGoalCard } from './goalCard.js';
import { buildFinalCard } from './finalCard.js';
import type { SpoilerMode } from './spoiler.js';
import type { LandingGoal, LandingAssist, PbpTeam, Play, BoxscoreResponse } from '../nhl/types.js';

const logger = pino({ name: 'simulator' });

// Fake game data for simulation
const FAKE_GAME_ID = 9999999;

const fakeHomeTeam: PbpTeam = {
  id: 59,
  abbrev: 'UTA',
  commonName: { default: 'Utah Mammoth' },
  logo: 'https://assets.nhle.com/logos/nhl/svg/UTA_light.svg',
  score: 0,
  sog: 0,
};

const fakeAwayTeam: PbpTeam = {
  id: 53,
  abbrev: 'ARI',
  commonName: { default: 'Arizona Coyotes' },
  logo: 'https://assets.nhle.com/logos/nhl/svg/ARI_light.svg',
  score: 0,
  sog: 0,
};

interface SimGoal {
  eventId: number;
  scorerName: string;
  scorerFirst: string;
  scorerLast: string;
  scorerNumber: number;
  goalsToDate: number;
  shotType: string;
  strength: string;
  assists: { first: string; last: string; number: number; assistsToDate: number }[];
  period: number;
  periodType: string;
  timeInPeriod: string;
  timeRemaining: string;
  isHome: boolean;
  homeScore: number;
  awayScore: number;
  homeSog: number;
  awaySog: number;
}

const simGoals: SimGoal[] = [
  {
    eventId: 1001,
    scorerName: 'Clayton Keller',
    scorerFirst: 'Clayton',
    scorerLast: 'Keller',
    scorerNumber: 9,
    goalsToDate: 22,
    shotType: 'wrist',
    strength: 'ev',
    assists: [
      { first: 'Barrett', last: 'Hayton', number: 29, assistsToDate: 18 },
      { first: 'Mikhail', last: 'Sergachev', number: 98, assistsToDate: 25 },
    ],
    period: 1, periodType: 'REG', timeInPeriod: '08:32', timeRemaining: '11:28',
    isHome: true, homeScore: 1, awayScore: 0, homeSog: 8, awaySog: 5,
  },
  {
    eventId: 1002,
    scorerName: 'Nick Schmaltz',
    scorerFirst: 'Nick',
    scorerLast: 'Schmaltz',
    scorerNumber: 8,
    goalsToDate: 15,
    shotType: 'snap',
    strength: 'pp',
    assists: [
      { first: 'Clayton', last: 'Keller', number: 9, assistsToDate: 35 },
    ],
    period: 2, periodType: 'REG', timeInPeriod: '03:15', timeRemaining: '16:45',
    isHome: true, homeScore: 2, awayScore: 1, homeSog: 18, awaySog: 14,
  },
  {
    eventId: 1003,
    scorerName: 'Logan Cooley',
    scorerFirst: 'Logan',
    scorerLast: 'Cooley',
    scorerNumber: 92,
    goalsToDate: 19,
    shotType: 'wrist',
    strength: 'ev',
    assists: [],
    period: 3, periodType: 'REG', timeInPeriod: '14:22', timeRemaining: '05:38',
    isHome: true, homeScore: 3, awayScore: 1, homeSog: 28, awaySog: 22,
  },
];

function buildLandingGoal(goal: SimGoal): LandingGoal {
  const assists: LandingAssist[] = goal.assists.map(a => ({
    playerId: Math.floor(Math.random() * 9000000) + 1000000,
    firstName: { default: a.first },
    lastName: { default: a.last },
    name: { default: `${a.first[0]}. ${a.last}` },
    assistsToDate: a.assistsToDate,
    sweaterNumber: a.number,
  }));

  return {
    eventId: goal.eventId,
    strength: goal.strength,
    playerId: Math.floor(Math.random() * 9000000) + 1000000,
    firstName: { default: goal.scorerFirst },
    lastName: { default: goal.scorerLast },
    name: { default: `${goal.scorerFirst[0]}. ${goal.scorerLast}` },
    teamAbbrev: { default: goal.isHome ? fakeHomeTeam.abbrev : fakeAwayTeam.abbrev },
    goalsToDate: goal.goalsToDate,
    awayScore: goal.awayScore,
    homeScore: goal.homeScore,
    timeInPeriod: goal.timeInPeriod,
    shotType: goal.shotType,
    goalModifier: 'none',
    assists,
    sweaterNumber: goal.scorerNumber,
    isHome: goal.isHome,
  };
}

function buildPlay(goal: SimGoal): Play {
  return {
    eventId: goal.eventId,
    typeCode: 505,
    typeDescKey: 'goal',
    periodDescriptor: { number: goal.period, periodType: goal.periodType },
    timeInPeriod: goal.timeInPeriod,
    timeRemaining: goal.timeRemaining,
    details: {
      scoringPlayerId: Math.floor(Math.random() * 9000000) + 1000000,
      scoringPlayerTotal: goal.goalsToDate,
      eventOwnerTeamId: goal.isHome ? fakeHomeTeam.id : fakeAwayTeam.id,
      shotType: goal.shotType,
      awayScore: goal.awayScore,
      homeScore: goal.homeScore,
    },
  };
}

export async function runSimulation(client: Client, guildId: string): Promise<void> {
  const config = getGuildConfig(guildId);
  if (!config?.gameday_channel_id) {
    logger.error({ guildId }, 'No gameday channel configured for simulation');
    return;
  }

  const channel = await client.channels.fetch(config.gameday_channel_id);
  if (!channel || !channel.isTextBased()) {
    logger.error({ channelId: config.gameday_channel_id }, 'Gameday channel not found');
    return;
  }

  const textChannel = channel as TextChannel;
  const guild = client.guilds.cache.get(guildId);
  const spoilerMode = (config.spoiler_mode ?? 'off') as SpoilerMode;
  const delayMs = (config.spoiler_delay_seconds ?? 30) * 1000;

  logger.info({ guildId }, 'Simulation started');

  // Post game start notification with role ping
  if (!hasGameStartBeenPosted(guildId, FAKE_GAME_ID)) {
    markGameStartPosted(guildId, FAKE_GAME_ID);

    let pingContent = '';
    if (config.gameday_role_id && guild) {
      const role = guild.roles.cache.get(config.gameday_role_id);
      if (role) {
        pingContent = `<@&${config.gameday_role_id}> `;
      }
    }

    const homeEmoji = getTeamEmoji(fakeHomeTeam.abbrev, guild);
    const awayEmoji = getTeamEmoji(fakeAwayTeam.abbrev, guild);

    const startEmbed = new EmbedBuilder()
      .setTitle('Game is starting!')
      .setDescription(`${awayEmoji} **${fakeAwayTeam.abbrev}** @ **${fakeHomeTeam.abbrev}** ${homeEmoji}`)
      .setColor(0x006847);

    await textChannel.send({
      content: pingContent || undefined,
      embeds: [startEmbed],
    });
  }

  // Post Period 1 starting (no delay, no ping)
  await new Promise(resolve => setTimeout(resolve, 2_000));
  const period1Embed = new EmbedBuilder()
    .setTitle('Period 1 is starting!')
    .setColor(0x006847);
  await textChannel.send({ embeds: [period1Embed] });

  // Post goals with delays between them
  let lastPeriod = 1;
  for (let i = 0; i < simGoals.length; i++) {
    const goal = simGoals[i];

    // Wait between goals (10 seconds between each for testing)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
    }

    // Check if period changed - post period start notification (no ping, no delay)
    if (goal.period > lastPeriod) {
      const periodName = goal.periodType === 'OT' ? 'Overtime' : `Period ${goal.period}`;
      const periodEmbed = new EmbedBuilder()
        .setTitle(`${periodName} is starting!`)
        .setColor(0x006847);
      await textChannel.send({ embeds: [periodEmbed] });
      lastPeriod = goal.period;
    }

    // Check dedup
    if (hasGoalBeenPosted(guildId, FAKE_GAME_ID, goal.eventId)) {
      logger.info({ eventId: goal.eventId }, 'Simulated goal already posted, skipping');
      continue;
    }

    markGoalPosted(guildId, FAKE_GAME_ID, goal.eventId);
    logger.info({ eventId: goal.eventId, delay: delayMs }, 'Simulated goal detected, posting after delay');

    await textChannel.send(`**[SIMULATION]** Goal detected! Posting in ${delayMs / 1000}s...`);

    const homeTeam = { ...fakeHomeTeam, score: goal.homeScore, sog: goal.homeSog };
    const awayTeam = { ...fakeAwayTeam, score: goal.awayScore, sog: goal.awaySog };

    const cardData = {
      landingGoal: buildLandingGoal(goal),
      play: buildPlay(goal),
      homeTeam,
      awayTeam,
      scoringTeamAbbrev: goal.isHome ? homeTeam.abbrev : awayTeam.abbrev,
      scoringTeamLogo: goal.isHome ? homeTeam.logo : awayTeam.logo,
      guild,
      primaryTeam: config.primary_team,
    };

    // Apply spoiler delay
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const { content, embed } = buildGoalCard(cardData, spoilerMode);
    await textChannel.send({ content: content ?? undefined, embeds: [embed] });
    logger.info({ eventId: goal.eventId }, 'Simulated goal card posted');
  }

  // Wait then post final
  await new Promise(resolve => setTimeout(resolve, 5_000));

  if (!hasFinalBeenPosted(guildId, FAKE_GAME_ID)) {
    markFinalPosted(guildId, FAKE_GAME_ID);
    await textChannel.send(`**[SIMULATION]** Game is FINAL! Posting summary in ${delayMs / 1000}s...`);

    await new Promise(resolve => setTimeout(resolve, delayMs));

    const fakeBoxscore: BoxscoreResponse = {
      id: FAKE_GAME_ID,
      gameState: 'FINAL',
      homeTeam: { id: 59, abbrev: 'UTA', logo: fakeHomeTeam.logo, score: 3, sog: 32 },
      awayTeam: { id: 53, abbrev: 'ARI', logo: fakeAwayTeam.logo, score: 1, sog: 24 },
      summary: {
        threeStars: [
          { star: 1, id: 1, firstName: { default: 'Clayton' }, lastName: { default: 'Keller' }, sweaterNumber: 9, teamAbbrev: 'UTA' },
          { star: 2, id: 2, firstName: { default: 'Logan' }, lastName: { default: 'Cooley' }, sweaterNumber: 92, teamAbbrev: 'UTA' },
          { star: 3, id: 3, firstName: { default: 'Nick' }, lastName: { default: 'Schmaltz' }, sweaterNumber: 8, teamAbbrev: 'UTA' },
        ],
      },
    };

    const { content, embed } = buildFinalCard(fakeBoxscore, spoilerMode, guild);
    await textChannel.send({ content: content ?? undefined, embeds: [embed] });
    logger.info({ guildId }, 'Simulated final summary posted');
  }

  await textChannel.send('**[SIMULATION] Complete!** All game-day features tested.');
}

export function resetSimulation(guildId: string): void {
  // Remove the fake game's posted goals, finals, and game starts from DB so simulation can run again
  const db = getDb();
  db.prepare('DELETE FROM posted_goals WHERE guild_id = ? AND game_id = ?').run(guildId, FAKE_GAME_ID);
  db.prepare('DELETE FROM posted_finals WHERE guild_id = ? AND game_id = ?').run(guildId, FAKE_GAME_ID);
  db.prepare('DELETE FROM posted_game_starts WHERE guild_id = ? AND game_id = ?').run(guildId, FAKE_GAME_ID);
}
