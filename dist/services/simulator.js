"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSimulation = runSimulation;
exports.resetSimulation = resetSimulation;
const pino_1 = __importDefault(require("pino"));
const database_js_1 = require("../db/database.js");
const queries_js_1 = require("../db/queries.js");
const goalCard_js_1 = require("./goalCard.js");
const finalCard_js_1 = require("./finalCard.js");
const logger = (0, pino_1.default)({ name: 'simulator' });
// Fake game data for simulation
const FAKE_GAME_ID = 9999999;
const fakeHomeTeam = {
    id: 59,
    abbrev: 'UTA',
    commonName: { default: 'Utah Mammoth' },
    logo: 'https://assets.nhle.com/logos/nhl/svg/UTA_light.svg',
    score: 0,
    sog: 0,
};
const fakeAwayTeam = {
    id: 53,
    abbrev: 'ARI',
    commonName: { default: 'Arizona Coyotes' },
    logo: 'https://assets.nhle.com/logos/nhl/svg/ARI_light.svg',
    score: 0,
    sog: 0,
};
const simGoals = [
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
function buildLandingGoal(goal) {
    const assists = goal.assists.map(a => ({
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
function buildPlay(goal) {
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
async function runSimulation(client, guildId) {
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    if (!config?.gameday_channel_id) {
        logger.error({ guildId }, 'No gameday channel configured for simulation');
        return;
    }
    const channel = await client.channels.fetch(config.gameday_channel_id);
    if (!channel || !channel.isTextBased()) {
        logger.error({ channelId: config.gameday_channel_id }, 'Gameday channel not found');
        return;
    }
    const textChannel = channel;
    const guild = client.guilds.cache.get(guildId);
    const spoilerMode = (config.spoiler_mode ?? 'off');
    const delayMs = (config.spoiler_delay_seconds ?? 30) * 1000;
    await textChannel.send('**[SIMULATION] Game starting: ARI @ UTA**');
    logger.info({ guildId }, 'Simulation started');
    // Post goals with delays between them
    for (let i = 0; i < simGoals.length; i++) {
        const goal = simGoals[i];
        // Wait between goals (10 seconds between each for testing)
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 10_000));
        }
        // Check dedup
        if ((0, queries_js_1.hasGoalBeenPosted)(guildId, FAKE_GAME_ID, goal.eventId)) {
            logger.info({ eventId: goal.eventId }, 'Simulated goal already posted, skipping');
            continue;
        }
        (0, queries_js_1.markGoalPosted)(guildId, FAKE_GAME_ID, goal.eventId);
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
        };
        // Apply spoiler delay
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const { content, embed } = (0, goalCard_js_1.buildGoalCard)(cardData, spoilerMode);
        await textChannel.send({ content: content ?? undefined, embeds: [embed] });
        logger.info({ eventId: goal.eventId }, 'Simulated goal card posted');
    }
    // Wait then post final
    await new Promise(resolve => setTimeout(resolve, 5_000));
    if (!(0, queries_js_1.hasFinalBeenPosted)(guildId, FAKE_GAME_ID)) {
        (0, queries_js_1.markFinalPosted)(guildId, FAKE_GAME_ID);
        await textChannel.send(`**[SIMULATION]** Game is FINAL! Posting summary in ${delayMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const fakeBoxscore = {
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
        const { content, embed } = (0, finalCard_js_1.buildFinalCard)(fakeBoxscore, spoilerMode, guild);
        await textChannel.send({ content: content ?? undefined, embeds: [embed] });
        logger.info({ guildId }, 'Simulated final summary posted');
    }
    await textChannel.send('**[SIMULATION] Complete!** All game-day features tested.');
}
function resetSimulation(guildId) {
    // Remove the fake game's posted goals and finals from DB so simulation can run again
    const db = (0, database_js_1.getDb)();
    db.prepare('DELETE FROM posted_goals WHERE guild_id = ? AND game_id = ?').run(guildId, FAKE_GAME_ID);
    db.prepare('DELETE FROM posted_finals WHERE guild_id = ? AND game_id = ?').run(guildId, FAKE_GAME_ID);
}
//# sourceMappingURL=simulator.js.map