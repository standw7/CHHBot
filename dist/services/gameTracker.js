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
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const queries_js_1 = require("../db/queries.js");
const goalCard_js_1 = require("./goalCard.js");
const finalCard_js_1 = require("./finalCard.js");
const logger = (0, pino_1.default)({ name: 'game-tracker' });
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
        logger.info({ guildId: ctx.guildId, gameId: ctx.currentGame.id }, 'Game is now LIVE');
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
        // Capture gameId and eventId for the closure
        const gameId = ctx.currentGame.id;
        const eventId = goal.eventId;
        // Schedule delayed post - fetch landing data at post time for rich info
        setTimeout(async () => {
            try {
                const channel = await client.channels.fetch(config.gameday_channel_id);
                if (!channel || !channel.isTextBased()) {
                    logger.error({ channelId: config.gameday_channel_id }, 'Game day channel not found');
                    return;
                }
                // Fetch landing for rich goal data (player names, assists, headshots)
                let landingGoal;
                try {
                    const landing = await nhlClient.getLanding(gameId);
                    if (landing?.summary?.scoring) {
                        for (const period of landing.summary.scoring) {
                            const match = period.goals.find(g => g.eventId === eventId);
                            if (match) {
                                landingGoal = match;
                                break;
                            }
                        }
                    }
                }
                catch (err) {
                    logger.warn({ err, gameId, eventId }, 'Failed to fetch landing for goal details');
                }
                const guild = client.guilds.cache.get(ctx.guildId);
                const cardData = {
                    landingGoal,
                    play: goal,
                    homeTeam: pbp.homeTeam,
                    awayTeam: pbp.awayTeam,
                    scoringTeamAbbrev,
                    scoringTeamLogo,
                    guild,
                    primaryTeam: ctx.teamCode,
                };
                const { content, embed } = (0, goalCard_js_1.buildGoalCard)(cardData, spoilerMode);
                await channel.send({
                    content: content ?? undefined,
                    embeds: [embed],
                });
                logger.info({ guildId: ctx.guildId, eventId }, 'Goal card posted');
            }
            catch (error) {
                logger.error({ error, eventId }, 'Failed to post goal card');
            }
        }, delayMs);
    }
    scheduleNext(client, ctx, 10_000); // Poll every 10s during live game
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
    logger.info({ guildId: ctx.guildId, gameId, delay: delayMs }, 'Scheduling final summary post');
    const boxscore = await nhlClient.getBoxscore(gameId);
    setTimeout(async () => {
        try {
            if (!boxscore) {
                logger.error({ gameId }, 'Failed to fetch boxscore for final summary');
                return;
            }
            const channel = await client.channels.fetch(config.gameday_channel_id);
            if (!channel || !channel.isTextBased()) {
                logger.error({ channelId: config.gameday_channel_id }, 'Game day channel not found');
                return;
            }
            const guild = client.guilds.cache.get(ctx.guildId);
            const { content, embed } = (0, finalCard_js_1.buildFinalCard)(boxscore, spoilerMode, guild);
            await channel.send({
                content: content ?? undefined,
                embeds: [embed],
            });
            logger.info({ guildId: ctx.guildId, gameId }, 'Final summary posted');
        }
        catch (error) {
            logger.error({ error, gameId }, 'Failed to post final summary');
        }
    }, delayMs);
    ctx.currentGame = null;
    ctx.state = 'IDLE';
    scheduleNext(client, ctx, 60_000); // Back to idle, check again in 1 min
}
//# sourceMappingURL=gameTracker.js.map