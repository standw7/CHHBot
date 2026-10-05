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
exports.DAILY_CHECKIN_HOUR = exports.REWARDS_PING_INTERVAL_MS = exports.REWARDS_CHANNEL_NAME = exports.REWARDS_ROLE_NAME = void 0;
exports.initialRewardsSchedule = initialRewardsSchedule;
exports.dueRewardsSlot = dueRewardsSlot;
exports.resolveRewardsRole = resolveRewardsRole;
exports.rewardsChannelOverwrites = rewardsChannelOverwrites;
exports.resolveRewardsChannel = resolveRewardsChannel;
exports.maybeSendRewardsReminder = maybeSendRewardsReminder;
exports.dailyCheckInStatus = dailyCheckInStatus;
exports.startDailyCheckInService = startDailyCheckInService;
exports.stopDailyCheckInService = stopDailyCheckInService;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const luxon_1 = require("luxon");
const nhlClient = __importStar(require("../nhl/client.js"));
const queries_js_1 = require("../db/queries.js");
const dailyCard_js_1 = require("./dailyCard.js");
const logger = (0, pino_1.default)({ name: 'rewards-reminder' });
exports.REWARDS_ROLE_NAME = 'Rewards';
exports.REWARDS_CHANNEL_NAME = 'rewards';
// How often to re-ping the Rewards role while a game is live.
exports.REWARDS_PING_INTERVAL_MS = 45 * 60_000;
/**
 * Starting schedule for a game with no pings recorded yet.
 * Watched from the start: 0:00 is now (puck drop), and mark 0 pings immediately.
 * Joined late (bot restarted mid-game): 0:00 is the scheduled start and marks
 * already passed are skipped, so the next ping waits for the next mark.
 */
function initialRewardsSchedule(watchedFromStart, scheduledStart, now) {
    if (watchedFromStart)
        return { anchorAt: now, lastSlot: -1 };
    return { anchorAt: scheduledStart, lastSlot: Math.floor((now - scheduledStart) / exports.REWARDS_PING_INTERVAL_MS) };
}
/**
 * Returns the mark to ping now, or null if none is due. If several marks passed
 * (e.g. during downtime) only the latest is returned, so it pings once.
 * Callers only invoke this while the game is LIVE, so nothing fires after FINAL.
 */
function dueRewardsSlot(schedule, now) {
    const current = Math.floor((now - schedule.anchorAt) / exports.REWARDS_PING_INTERVAL_MS);
    return current > schedule.lastSlot ? current : null;
}
/**
 * Find the Rewards role (saved ID first, then by name, case-insensitive).
 * With `create`, makes the role if it doesn't exist. Saves the ID to guild config.
 */
async function resolveRewardsRole(guild, create) {
    const config = (0, queries_js_1.getGuildConfig)(guild.id);
    let role = config?.rewards_role_id ? guild.roles.cache.get(config.rewards_role_id) ?? null : null;
    role ??= guild.roles.cache.find(r => r.name.toLowerCase() === exports.REWARDS_ROLE_NAME.toLowerCase()) ?? null;
    if (!role && create) {
        role = await guild.roles.create({
            name: exports.REWARDS_ROLE_NAME,
            mentionable: true,
            reason: 'Created for rewards check-in reminders',
        });
        logger.info({ guildId: guild.id, roleId: role.id }, 'Created Rewards role');
    }
    if (role && !role.mentionable) {
        logger.warn({ guildId: guild.id, roleId: role.id }, 'Rewards role is not mentionable; pings only work if the bot has Mention Everyone');
    }
    if (role && config?.rewards_role_id !== role.id) {
        (0, queries_js_1.upsertGuildConfig)(guild.id, { rewards_role_id: role.id });
    }
    return role;
}
const POSTING = [
    discord_js_1.PermissionFlagsBits.SendMessages,
    discord_js_1.PermissionFlagsBits.SendMessagesInThreads,
    discord_js_1.PermissionFlagsBits.CreatePublicThreads,
    discord_js_1.PermissionFlagsBits.CreatePrivateThreads,
];
/**
 * Read-only for the Rewards role, hidden from everyone else. Tusky and mod roles
 * (Manage Messages, excluding bot-managed roles) can see and post; admins bypass overwrites.
 */
function rewardsChannelOverwrites(guild, role) {
    const view = [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory];
    const modRoles = guild.roles.cache.filter(r => !r.managed && r.permissions.has(discord_js_1.PermissionFlagsBits.ManageMessages) && !r.permissions.has(discord_js_1.PermissionFlagsBits.Administrator));
    return [
        { id: guild.roles.everyone.id, deny: [discord_js_1.PermissionFlagsBits.ViewChannel] },
        { id: role.id, allow: view, deny: POSTING },
        ...modRoles.map(r => ({ id: r.id, allow: [...view, discord_js_1.PermissionFlagsBits.SendMessages] })),
        { id: guild.client.user.id, allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages] },
    ];
}
/**
 * Find the #rewards channel (saved ID first, then by name). If missing, creates it
 * with rewardsChannelOverwrites(). An existing channel is used as-is.
 */
async function resolveRewardsChannel(guild, role) {
    const config = (0, queries_js_1.getGuildConfig)(guild.id);
    let channel = config?.rewards_channel_id ? guild.channels.cache.get(config.rewards_channel_id) : undefined;
    channel ??= guild.channels.cache.find(c => c.type === discord_js_1.ChannelType.GuildText && c.name.toLowerCase() === exports.REWARDS_CHANNEL_NAME);
    if (!channel) {
        channel = await guild.channels.create({
            name: exports.REWARDS_CHANNEL_NAME,
            type: discord_js_1.ChannelType.GuildText,
            topic: 'Check-in reminders during games. Use !rewards to opt in or out.',
            reason: 'Created for rewards check-in reminders',
            permissionOverwrites: rewardsChannelOverwrites(guild, role),
        });
        logger.info({ guildId: guild.id, channelId: channel.id }, 'Created #rewards channel');
    }
    if (channel.type !== discord_js_1.ChannelType.GuildText)
        return null;
    if (config?.rewards_channel_id !== channel.id) {
        (0, queries_js_1.upsertGuildConfig)(guild.id, { rewards_channel_id: channel.id });
    }
    return channel;
}
/**
 * Called on every LIVE tick. Pings the Rewards role in #rewards at each 45-minute
 * mark (see initialRewardsSchedule for where 0:00 is). The schedule is persisted
 * per game so a bot restart resumes it instead of re-pinging.
 */
async function maybeSendRewardsReminder(client, guildId, gameId, watchedFromStart, scheduledStart) {
    const now = Date.now();
    let schedule = (0, queries_js_1.getRewardsSchedule)(guildId, gameId);
    if (!schedule) {
        schedule = initialRewardsSchedule(watchedFromStart, scheduledStart, now);
        (0, queries_js_1.saveRewardsSchedule)(guildId, gameId, schedule);
        logger.info({ guildId, gameId, watchedFromStart, ...schedule }, 'Rewards schedule started');
    }
    const slot = dueRewardsSlot(schedule, now);
    if (slot === null)
        return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild)
        return;
    // Claim the mark before any async work so a slow send can't cause a double ping
    (0, queries_js_1.saveRewardsSchedule)(guildId, gameId, { ...schedule, lastSlot: slot });
    const text = slot === 0
        ? "🦣 Puck's dropped! Don't forget to check in to earn your points."
        : "🦣 Reminder: check in if you haven't yet to earn your points!";
    try {
        const role = await resolveRewardsRole(guild, false);
        if (!role)
            return;
        const channel = await resolveRewardsChannel(guild, role);
        if (!channel) {
            logger.error({ guildId }, 'Rewards channel is not a text channel');
            return;
        }
        await channel.send(`<@&${role.id}> ${text}`);
        logger.info({ guildId, gameId, slot }, 'Rewards reminder posted');
    }
    catch (error) {
        logger.error({ error, guildId, gameId }, 'Failed to post rewards reminder');
    }
}
// --- Daily check-in reminder (5pm local, every day in season) ---
exports.DAILY_CHECKIN_HOUR = 17;
const DAILY_CHECKIN_POLL_MS = 60_000;
/**
 * Pure: whether today's 5pm reminder is due. In the configured season window it is due
 * from 5pm until midnight (a bot that was down at 5pm still posts later that day).
 * Outside the window the caller must check for remaining playoff games.
 */
function dailyCheckInStatus(localHour, todayISO, window) {
    if (localHour < exports.DAILY_CHECKIN_HOUR)
        return 'not_yet';
    return window.start <= todayISO && todayISO <= window.end ? 'due' : 'check_playoffs';
}
let dailyTimer = null;
function startDailyCheckInService(client) {
    if (dailyTimer)
        return;
    dailyTimer = setInterval(() => {
        for (const [guildId, guild] of client.guilds.cache) {
            processDailyCheckIn(guild).catch(err => logger.error({ err, guildId }, 'Daily check-in reminder error'));
        }
    }, DAILY_CHECKIN_POLL_MS);
    logger.info('Daily check-in reminder service started');
}
function stopDailyCheckInService() {
    if (dailyTimer)
        clearInterval(dailyTimer);
    dailyTimer = null;
}
async function processDailyCheckIn(guild) {
    const config = (0, queries_js_1.getGuildConfig)(guild.id);
    if (!config)
        return;
    // 5pm on the guild's local clock, so it survives daylight saving
    const now = luxon_1.DateTime.now().setZone(config.timezone || 'America/Denver');
    const todayISO = now.toISODate();
    if (!todayISO || (0, queries_js_1.hasDailyCheckInBeenPosted)(guild.id, todayISO))
        return;
    const window = { start: config.season_start || dailyCard_js_1.DEFAULT_SEASON_START, end: config.season_end || dailyCard_js_1.DEFAULT_SEASON_END };
    const status = dailyCheckInStatus(now.hour, todayISO, window);
    if (status === 'not_yet')
        return;
    const role = await resolveRewardsRole(guild, false);
    if (!role)
        return; // no Rewards role in this guild
    if (status === 'check_playoffs') {
        const schedule = await nhlClient.getSchedule(config.primary_team);
        if (!schedule)
            return; // transient API failure: retry next tick
        const playoffsLeft = schedule.games?.some(g => g.gameType === 3 && g.gameDate >= todayISO);
        if (!playoffsLeft) {
            (0, queries_js_1.markDailyCheckInPosted)(guild.id, todayISO); // off-season: settle today without posting
            return;
        }
    }
    // Claim before posting so overlapping ticks can't double-post
    if (!(0, queries_js_1.markDailyCheckInPosted)(guild.id, todayISO))
        return;
    const channel = await resolveRewardsChannel(guild, role);
    if (!channel) {
        logger.error({ guildId: guild.id }, 'Rewards channel is not a text channel');
        return;
    }
    await channel.send(`<@&${role.id}> 🦣 Daily reminder: don't forget to check in today to earn your points!`);
    logger.info({ guildId: guild.id, date: todayISO }, 'Daily check-in reminder posted');
}
//# sourceMappingURL=rewardsReminder.js.map