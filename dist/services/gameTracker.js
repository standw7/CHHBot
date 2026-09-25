"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTracker = startTracker;
exports.stopTracker = stopTracker;
exports.stopAllTrackers = stopAllTrackers;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const queries_js_1 = require("../db/queries.js");
const goalCard_js_1 = require("./goalCard.js");
const finalCard_js_1 = require("./finalCard.js");
const milestones_js_1 = require("./milestones.js");
const rewardsReminder_js_1 = require("./rewardsReminder.js");
const postGame_js_1 = require("./postGame.js");
const spoiler_js_1 = require("./spoiler.js");
const standings_js_1 = require("./standings.js");
const logger = (0, pino_1.default)({ name: 'game-tracker' });
// Replay-link polling: how often to re-check the landing endpoint for a goal's
// highlight clip, and how many times to try before giving up.
const REPLAY_POLL_INTERVAL_MS = 60_000;
const REPLAY_POLL_MAX_ATTEMPTS = 20;
const trackers = new Map();
function startTracker(client, guildId) {
    if (trackers.has(guildId)) {
        logger.info({ guildId }, 'Tracker already running');
        return;
    }
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    if (!config) {
        logger.warn({ guildId }, 'No guild config, cannot start tracker');
        return;
    }
    const ctx = {
        state: 'IDLE',
        currentGame: null,
        guildId,
        teamCode: config.primary_team,
        pollTimer: null,
        lastAnnouncedPeriod: 0,
        watchedFromStart: false,
        standingsBefore: null,
        careerCache: new Map(),
        replayPollTimers: new Set(),
    };
    trackers.set(guildId, ctx);
    logger.info({ guildId, teamCode: ctx.teamCode }, 'Starting game tracker');
    tick(client, ctx);
}
function stopTracker(guildId) {
    const ctx = trackers.get(guildId);
    if (ctx?.pollTimer) {
        clearTimeout(ctx.pollTimer);
    }
    if (ctx) {
        for (const timer of ctx.replayPollTimers) {
            clearTimeout(timer);
        }
        ctx.replayPollTimers.clear();
    }
    trackers.delete(guildId);
    logger.info({ guildId }, 'Stopped game tracker');
}
function stopAllTrackers() {
    for (const [guildId] of trackers) {
        stopTracker(guildId);
    }
}
function scheduleNext(client, ctx, delayMs) {
    if (ctx.pollTimer)
        clearTimeout(ctx.pollTimer);
    ctx.pollTimer = setTimeout(() => tick(client, ctx), delayMs);
}
async function tick(client, ctx) {
    try {
        switch (ctx.state) {
            case 'IDLE':
                await handleIdle(client, ctx);
                break;
            case 'PRE_GAME':
                await handlePreGame(client, ctx);
                break;
            case 'LIVE':
                await handleLive(client, ctx);
                break;
            case 'FINAL':
                await handleFinal(client, ctx);
                break;
        }
    }
    catch (error) {
        logger.error({ error, state: ctx.state, guildId: ctx.guildId }, 'Tracker tick error');
        // Retry after a delay on errors
        scheduleNext(client, ctx, 30_000);
    }
}
async function handleIdle(client, ctx) {
    const schedule = await nhlClient.getSchedule(ctx.teamCode);
    if (!schedule?.games?.length) {
        scheduleNext(client, ctx, 30 * 60_000); // Check again in 30 min
        return;
    }
    const now = Date.now();
    // Find a live game first
    const liveGame = schedule.games.find(g => g.gameState === 'LIVE' || g.gameState === 'CRIT');
    if (liveGame) {
        ctx.currentGame = liveGame;
        ctx.state = 'LIVE';
        ctx.careerCache.clear();
        ctx.watchedFromStart = false;
        ctx.standingsBefore = (0, standings_js_1.standingsForSeason)(await nhlClient.getStandings(true), ctx.currentGame.season);
        logger.info({ guildId: ctx.guildId, gameId: liveGame.id }, 'Found live game, switching to LIVE');
        scheduleNext(client, ctx, 0);
        return;
    }
    // Find next upcoming game
    const upcoming = schedule.games
        .filter(g => g.gameState === 'FUT' || g.gameState === 'PRE')
        .sort((a, b) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime());
    const nextGame = upcoming[0];
    if (!nextGame) {
        scheduleNext(client, ctx, 30 * 60_000);
        return;
    }
    const gameStart = new Date(nextGame.startTimeUTC).getTime();
    const timeUntilGame = gameStart - now;
    if (timeUntilGame <= 24 * 60 * 60_000) {
        ctx.currentGame = nextGame;
        ctx.state = 'PRE_GAME';
        logger.info({ guildId: ctx.guildId, gameId: nextGame.id, timeUntilGame }, 'Game within 24h, switching to PRE_GAME');
        scheduleNext(client, ctx, 0);
    }
    else {
        scheduleNext(client, ctx, 30 * 60_000); // Check again in 30 min
    }
}
async function handlePreGame(client, ctx) {
    if (!ctx.currentGame) {
        ctx.state = 'IDLE';
        scheduleNext(client, ctx, 0);
        return;
    }
    // Re-check game state from the API
    const pbp = await nhlClient.getPlayByPlay(ctx.currentGame.id);
    if (pbp?.gameState === 'LIVE' || pbp?.gameState === 'CRIT') {
        ctx.state = 'LIVE';
        ctx.careerCache.clear();
        ctx.watchedFromStart = true;
        ctx.standingsBefore = (0, standings_js_1.standingsForSeason)(await nhlClient.getStandings(true), ctx.currentGame.season);
        logger.info({ guildId: ctx.guildId, gameId: ctx.currentGame.id }, 'Game is now LIVE');
        // Post game start notification if not already posted
        await postGameStartNotification(client, ctx, pbp.homeTeam, pbp.awayTeam);
        scheduleNext(client, ctx, 0);
        return;
    }
    if (pbp?.gameState === 'FINAL' || pbp?.gameState === 'OFF') {
        ctx.state = 'FINAL';
        scheduleNext(client, ctx, 0);
        return;
    }
    const gameStart = new Date(ctx.currentGame.startTimeUTC).getTime();
    const timeUntilGame = gameStart - Date.now();
    if (timeUntilGame <= 30 * 60_000) {
        // Within 30 min of puck drop, poll every 60s
        scheduleNext(client, ctx, 60_000);
    }
    else {
        // More than 30 min out, poll every 5 min
        scheduleNext(client, ctx, 5 * 60_000);
    }
}
async function handleLive(client, ctx) {
    if (!ctx.currentGame) {
        ctx.state = 'IDLE';
        scheduleNext(client, ctx, 0);
        return;
    }
    const pbp = await nhlClient.getPlayByPlay(ctx.currentGame.id);
    if (!pbp) {
        logger.warn({ guildId: ctx.guildId, gameId: ctx.currentGame.id }, 'Failed to fetch play-by-play');
        scheduleNext(client, ctx, 10_000);
        return;
    }
    // Check if game ended
    if (pbp.gameState === 'FINAL' || pbp.gameState === 'OFF') {
        ctx.state = 'FINAL';
        logger.info({ guildId: ctx.guildId, gameId: ctx.currentGame.id }, 'Game is FINAL');
        scheduleNext(client, ctx, 0);
        return;
    }
    // Rewards check-in ping at each 45-min mark until FINAL
    await (0, rewardsReminder_js_1.maybeSendRewardsReminder)(client, ctx.guildId, ctx.currentGame.id, ctx.watchedFromStart, new Date(ctx.currentGame.startTimeUTC).getTime());
    // Check for period changes and post period start notification (no ping, no delay)
    // Skip period 1 since "Game is starting!" already covers that
    const currentPeriod = pbp.period;
    if (currentPeriod > ctx.lastAnnouncedPeriod && currentPeriod > 1 && !pbp.clock.inIntermission) {
        ctx.lastAnnouncedPeriod = currentPeriod;
        await postPeriodStartNotification(client, ctx, currentPeriod, pbp.plays);
    }
    else if (currentPeriod > ctx.lastAnnouncedPeriod) {
        ctx.lastAnnouncedPeriod = currentPeriod; // Still track period 1, just don't announce it
    }
    // Detect new goals
    const goals = pbp.plays.filter(p => p.typeDescKey === 'goal');
    const config = (0, queries_js_1.getGuildConfig)(ctx.guildId);
    if (!config?.gameday_channel_id) {
        scheduleNext(client, ctx, 10_000);
        return;
    }
    const spoilerMode = (config.spoiler_mode ?? 'off');
    const delayMs = (config.spoiler_delay_seconds ?? 30) * 1000;
    for (const goal of goals) {
        if ((0, queries_js_1.hasGoalBeenPosted)(ctx.guildId, ctx.currentGame.id, goal.eventId)) {
            continue;
        }
        // Claim this goal immediately
        (0, queries_js_1.markGoalPosted)(ctx.guildId, ctx.currentGame.id, goal.eventId);
        logger.info({
            guildId: ctx.guildId,
            gameId: ctx.currentGame.id,
            eventId: goal.eventId,
            delay: delayMs,
        }, 'Goal detected, scheduling delayed post');
        // Determine scoring team
        const scoringTeamId = goal.details?.eventOwnerTeamId;
        const isHome = scoringTeamId === pbp.homeTeam.id;
        const scoringTeamAbbrev = isHome ? pbp.homeTeam.abbrev : pbp.awayTeam.abbrev;
        const scoringTeamLogo = isHome ? pbp.homeTeam.logo : pbp.awayTeam.logo;
        const isPrimaryTeam = scoringTeamAbbrev === ctx.teamCode;
        // Capture gameId, eventId, and gameType for the closure (ctx.currentGame may change by post time)
        const gameId = ctx.currentGame.id;
        const eventId = goal.eventId;
        const gameType = ctx.currentGame.gameType;
        const periodType = goal.periodDescriptor?.periodType ?? 'REG';
        // Schedule delayed post - fetch landing data at post time for rich info
        setTimeout(async () => {
            try {
                const channel = await client.channels.fetch(config.gameday_channel_id);
                if (!channel || !channel.isTextBased()) {
                    logger.error({ channelId: config.gameday_channel_id }, 'Game day channel not found');
                    return;
                }
                // Fetch landing for rich goal data (player names, assists, headshots), and
                // build goalsSoFar (all goals up to and including this one, tagged with periodType)
                let landingGoal;
                let goalsSoFar = [];
                try {
                    const landing = await nhlClient.getLanding(gameId);
                    if (landing?.summary?.scoring) {
                        const flattened = [];
                        for (const period of landing.summary.scoring) {
                            for (const g of period.goals) {
                                flattened.push({ ...g, periodType: period.periodDescriptor?.periodType });
                            }
                        }
                        const idx = flattened.findIndex(g => g.eventId === eventId);
                        if (idx !== -1) {
                            landingGoal = flattened[idx];
                            goalsSoFar = flattened.slice(0, idx + 1);
                        }
                    }
                }
                catch (err) {
                    logger.warn({ err, gameId, eventId }, 'Failed to fetch landing for goal details');
                }
                // Career totals lookup (regular season only, primary team scorers only), cached per game
                let careerBefore;
                if (landingGoal && isPrimaryTeam && gameType === 2) {
                    const playerId = landingGoal.playerId;
                    if (ctx.careerCache.has(playerId)) {
                        careerBefore = ctx.careerCache.get(playerId);
                    }
                    else {
                        try {
                            const playerStats = await nhlClient.getPlayerStats(playerId);
                            const career = playerStats?.careerTotals?.regularSeason;
                            if (career && typeof career.goals === 'number' && typeof career.points === 'number') {
                                careerBefore = { goals: career.goals, points: career.points };
                                ctx.careerCache.set(playerId, careerBefore);
                            }
                            else {
                                logger.warn({ playerId }, 'Career totals missing from player stats response, skipping career milestones');
                            }
                        }
                        catch (err) {
                            logger.warn({ err, playerId }, 'Failed to fetch player stats for career milestones');
                        }
                    }
                }
                const milestones = landingGoal
                    ? (0, milestones_js_1.detectMilestones)({
                        goal: landingGoal,
                        goalsSoFar,
                        periodType,
                        gameType,
                        isPrimaryTeam,
                        careerBefore,
                    })
                    : undefined;
                const guild = client.guilds.cache.get(ctx.guildId);
                const replayUrl = landingGoal?.highlightClipSharingUrl;
                const cardData = {
                    landingGoal,
                    play: goal,
                    homeTeam: pbp.homeTeam,
                    awayTeam: pbp.awayTeam,
                    scoringTeamAbbrev,
                    scoringTeamLogo,
                    guild,
                    primaryTeam: ctx.teamCode,
                    milestones,
                    replayUrl,
                };
                const { content, embed } = (0, goalCard_js_1.buildGoalCard)(cardData, spoilerMode);
                const message = await channel.send({
                    content: content ?? undefined,
                    embeds: [embed],
                });
                logger.info({ guildId: ctx.guildId, eventId }, 'Goal card posted');
                // If the replay clip isn't ready yet, poll the landing endpoint for it
                // and edit the message in place once it shows up.
                if (!replayUrl) {
                    pollForReplay(ctx, gameId, eventId, cardData, spoilerMode, message, 1);
                }
            }
            catch (error) {
                logger.error({ error, eventId }, 'Failed to post goal card');
            }
        }, delayMs);
    }
    scheduleNext(client, ctx, 10_000); // Poll every 10s during live game
}
// Poll the landing endpoint for a goal's highlight clip and edit the already-posted
// card in place once it appears. Stops on success, after REPLAY_POLL_MAX_ATTEMPTS
// attempts, or if the tracker is stopped (its timer gets cleared out from under it).
function pollForReplay(ctx, gameId, eventId, cardData, spoilerMode, message, attempt) {
    const timer = setTimeout(async () => {
        ctx.replayPollTimers.delete(timer);
        // getLanding never rejects — on a network/HTTP failure (404/5xx/429/parse
        // error/fetch exception, after its own internal retries) it resolves to
        // null. That's the real "network/API failure" case, so it's logged here
        // rather than relying on a catch that a plain fetch failure never reaches.
        const landing = await nhlClient.getLanding(gameId);
        if (!landing) {
            logger.warn({ gameId, eventId, attempt }, 'Landing endpoint unavailable while polling for goal replay, will retry');
        }
        else {
            const replayUrl = (0, goalCard_js_1.findReplayUrl)(landing, eventId);
            if (replayUrl) {
                try {
                    const { content, embed } = (0, goalCard_js_1.buildGoalCard)({ ...cardData, replayUrl }, spoilerMode);
                    await message.edit({ content: content ?? undefined, embeds: [embed] });
                    logger.info({ guildId: ctx.guildId, eventId, attempt }, 'Replay link attached to goal card');
                    return;
                }
                catch (err) {
                    if (err instanceof discord_js_1.DiscordAPIError && err.code === 10008) {
                        logger.info({ gameId, eventId, attempt }, 'Goal card message was deleted, stopping replay poll');
                        return;
                    }
                    logger.warn({ err, gameId, eventId, attempt }, 'Failed to edit goal card with replay link, will retry');
                }
            }
        }
        if (attempt < REPLAY_POLL_MAX_ATTEMPTS) {
            pollForReplay(ctx, gameId, eventId, cardData, spoilerMode, message, attempt + 1);
        }
        else {
            logger.info({ guildId: ctx.guildId, eventId }, 'Gave up polling for replay link');
        }
    }, REPLAY_POLL_INTERVAL_MS);
    ctx.replayPollTimers.add(timer);
}
async function handleFinal(client, ctx) {
    if (!ctx.currentGame) {
        ctx.state = 'IDLE';
        scheduleNext(client, ctx, 0);
        return;
    }
    const gameId = ctx.currentGame.id;
    if ((0, queries_js_1.hasFinalBeenPosted)(ctx.guildId, gameId)) {
        logger.info({ guildId: ctx.guildId, gameId }, 'Final already posted, returning to IDLE');
        ctx.currentGame = null;
        ctx.state = 'IDLE';
        scheduleNext(client, ctx, 60_000);
        return;
    }
    const config = (0, queries_js_1.getGuildConfig)(ctx.guildId);
    if (!config?.gameday_channel_id) {
        ctx.currentGame = null;
        ctx.state = 'IDLE';
        scheduleNext(client, ctx, 60_000);
        return;
    }
    // Claim the final post
    (0, queries_js_1.markFinalPosted)(ctx.guildId, gameId);
    const spoilerMode = (config.spoiler_mode ?? 'off');
    const delayMs = (config.spoiler_delay_seconds ?? 30) * 1000;
    // Captured now: ctx is reset for the next game before the delayed post runs.
    const { teamCode, standingsBefore } = ctx;
    const gameType = ctx.currentGame.gameType;
    ctx.standingsBefore = null;
    logger.info({ guildId: ctx.guildId, gameId, delay: delayMs }, 'Scheduling final summary post');
    setTimeout(async () => {
        try {
            // Use getLanding instead of getBoxscore - it has more complete data including three stars
            const landing = await nhlClient.getLanding(gameId);
            if (!landing) {
                logger.error({ gameId }, 'Failed to fetch landing for final summary');
                return;
            }
            // Convert landing to boxscore format for buildFinalCard.
            // The last scoring period tells us whether the game was decided in OT/SO.
            const scoringPeriods = landing.summary?.scoring;
            const lastPeriod = scoringPeriods && scoringPeriods.length > 0 ? scoringPeriods[scoringPeriods.length - 1] : undefined;
            const boxscore = {
                id: landing.id,
                gameState: landing.gameState,
                homeTeam: landing.homeTeam,
                awayTeam: landing.awayTeam,
                summary: landing.summary,
                periodDescriptor: lastPeriod?.periodDescriptor,
            };
            const channel = await client.channels.fetch(config.gameday_channel_id);
            if (!channel || !channel.isTextBased()) {
                logger.error({ channelId: config.gameday_channel_id }, 'Game day channel not found');
                return;
            }
            const guild = client.guilds.cache.get(ctx.guildId);
            const { content, embed } = (0, finalCard_js_1.buildFinalCard)(boxscore, spoilerMode, guild);
            const finalMessage = await channel.send({
                content: content ?? undefined,
                embeds: [embed],
            });
            logger.info({ guildId: ctx.guildId, gameId }, 'Final summary posted');
            // Standings reveal the result, so only when the final card shows scores; regular season only.
            (0, postGame_js_1.startPostGameFollowUp)({
                client,
                guildId: ctx.guildId,
                channelId: config.gameday_channel_id,
                gameId,
                teamCode,
                awayAbbrev: landing.awayTeam.abbrev,
                homeAbbrev: landing.homeTeam.abbrev,
                finalMessage,
                standingsBefore,
                trackStandings: gameType === 2 && (0, spoiler_js_1.shouldIncludeScoresInEmbed)(spoilerMode),
            });
        }
        catch (error) {
            logger.error({ error, gameId }, 'Failed to post final summary');
        }
    }, delayMs);
    ctx.currentGame = null;
    ctx.state = 'IDLE';
    ctx.lastAnnouncedPeriod = 0;
    scheduleNext(client, ctx, 60_000); // Back to idle, check again in 1 min
}
async function postGameStartNotification(client, ctx, homeTeam, awayTeam) {
    if (!ctx.currentGame)
        return;
    const gameId = ctx.currentGame.id;
    // Check if already posted
    if ((0, queries_js_1.hasGameStartBeenPosted)(ctx.guildId, gameId)) {
        logger.info({ guildId: ctx.guildId, gameId }, 'Game start already posted, skipping');
        return;
    }
    const config = (0, queries_js_1.getGuildConfig)(ctx.guildId);
    if (!config?.gameday_channel_id) {
        logger.warn({ guildId: ctx.guildId }, 'No gameday channel configured for game start notification');
        return;
    }
    // Mark as posted immediately to prevent duplicates
    (0, queries_js_1.markGameStartPosted)(ctx.guildId, gameId);
    try {
        const channel = await client.channels.fetch(config.gameday_channel_id);
        if (!channel || !channel.isTextBased()) {
            logger.error({ channelId: config.gameday_channel_id }, 'Gameday channel not found');
            return;
        }
        const guild = client.guilds.cache.get(ctx.guildId);
        // Build the ping content
        let pingContent = '';
        if (config.gameday_role_id && guild) {
            const role = guild.roles.cache.get(config.gameday_role_id);
            if (role) {
                pingContent = `<@&${config.gameday_role_id}> `;
            }
        }
        // Get team emojis
        const { getTeamEmoji } = await import('./goalCard.js');
        const homeEmoji = getTeamEmoji(homeTeam.abbrev, guild);
        const awayEmoji = getTeamEmoji(awayTeam.abbrev, guild);
        // Fetch standings for team records
        // Only this season's standings — during preseason the NHL still serves last season's
        const standings = (0, standings_js_1.standingsForSeason)(await nhlClient.getStandings(), ctx.currentGame.season);
        const homeStanding = standings?.find(s => s.teamAbbrev.default === homeTeam.abbrev);
        const awayStanding = standings?.find(s => s.teamAbbrev.default === awayTeam.abbrev);
        // Format streak (W2, L1, OT, etc.)
        const formatStreak = (standing) => {
            if (!standing)
                return '';
            const code = standing.streakCode;
            const count = standing.streakCount;
            if (code === 'OT')
                return 'OT';
            return `${code}${count}`;
        };
        // Build description with matchup and records
        let description = `${awayEmoji} **${awayTeam.abbrev}** @ **${homeTeam.abbrev}** ${homeEmoji}\n\n`;
        if (awayStanding) {
            description += `**${awayTeam.abbrev}**: GP:${awayStanding.gamesPlayed} W:${awayStanding.wins} L:${awayStanding.losses} OT:${awayStanding.otLosses} PTS:${awayStanding.points} S:${formatStreak(awayStanding)}\n`;
        }
        if (homeStanding) {
            description += `**${homeTeam.abbrev}**: GP:${homeStanding.gamesPlayed} W:${homeStanding.wins} L:${homeStanding.losses} OT:${homeStanding.otLosses} PTS:${homeStanding.points} S:${formatStreak(homeStanding)}`;
        }
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('Game is starting!')
            .setDescription(description)
            .setColor(0x006847);
        await channel.send({
            content: pingContent || undefined,
            embeds: [embed],
        });
        logger.info({ guildId: ctx.guildId, gameId }, 'Game start notification posted');
    }
    catch (error) {
        logger.error({ error, gameId: ctx.currentGame.id }, 'Failed to post game start notification');
    }
}
async function postPeriodStartNotification(client, ctx, period, plays) {
    const config = (0, queries_js_1.getGuildConfig)(ctx.guildId);
    if (!config?.gameday_channel_id)
        return;
    try {
        const channel = await client.channels.fetch(config.gameday_channel_id);
        if (!channel || !channel.isTextBased())
            return;
        // Determine period name
        // Check if this is overtime by looking at plays for OT period type
        const periodPlay = plays.find(p => p.periodDescriptor?.number === period);
        const isOT = periodPlay?.periodDescriptor?.periodType === 'OT';
        const isSO = periodPlay?.periodDescriptor?.periodType === 'SO';
        let periodName;
        if (isSO) {
            periodName = 'Shootout';
        }
        else if (isOT) {
            periodName = period === 4 ? 'Overtime' : `Overtime ${period - 3}`;
        }
        else {
            periodName = `Period ${period}`;
        }
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setTitle(`${periodName} is starting!`)
            .setColor(0x006847);
        // No ping for period notifications
        await channel.send({ embeds: [embed] });
        logger.info({ guildId: ctx.guildId, period, periodName }, 'Period start notification posted');
    }
    catch (error) {
        logger.error({ error, period }, 'Failed to post period start notification');
    }
}
//# sourceMappingURL=gameTracker.js.map