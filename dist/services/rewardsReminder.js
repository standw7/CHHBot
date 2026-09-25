"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REWARDS_PING_INTERVAL_MS = exports.REWARDS_CHANNEL_NAME = exports.REWARDS_ROLE_NAME = void 0;
exports.initialRewardsSchedule = initialRewardsSchedule;
exports.dueRewardsSlot = dueRewardsSlot;
exports.resolveRewardsRole = resolveRewardsRole;
exports.resolveRewardsChannel = resolveRewardsChannel;
exports.maybeSendRewardsReminder = maybeSendRewardsReminder;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../db/queries.js");
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
/**
 * Find the #rewards channel (saved ID first, then by name). If missing, creates it
 * visible only to the Rewards role and the bot. An existing channel is used as-is.
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
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [discord_js_1.PermissionFlagsBits.ViewChannel] },
                { id: role.id, allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory] },
                { id: guild.client.user.id, allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages] },
            ],
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
//# sourceMappingURL=rewardsReminder.js.map