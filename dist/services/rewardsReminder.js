"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REWARDS_PING_INTERVAL_MS = exports.REWARDS_CHANNEL_NAME = exports.REWARDS_ROLE_NAME = void 0;
exports.isRewardsPingDue = isRewardsPingDue;
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
 * Pure timing rule: a ping is due if none has been sent for this game yet,
 * or if at least REWARDS_PING_INTERVAL_MS has passed since the last one.
 * Callers only invoke this while the game is LIVE, so nothing fires after FINAL.
 */
function isRewardsPingDue(lastPingAt, now) {
    if (lastPingAt === null)
        return true;
    return now - lastPingAt >= exports.REWARDS_PING_INTERVAL_MS;
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
 * Called on every LIVE tick. Pings the Rewards role in #rewards at puck drop and
 * every 45 minutes after. The last ping time is persisted per game so a bot
 * restart resumes the same schedule instead of re-pinging.
 */
async function maybeSendRewardsReminder(client, guildId, gameId) {
    const lastPingAt = (0, queries_js_1.getLastRewardsPing)(guildId, gameId);
    const now = Date.now();
    if (!isRewardsPingDue(lastPingAt, now))
        return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild)
        return;
    // Claim the slot before any async work so a slow send can't cause a double ping
    (0, queries_js_1.markRewardsPing)(guildId, gameId, now);
    const isFirst = lastPingAt === null;
    const text = isFirst
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
        logger.info({ guildId, gameId, isFirst }, 'Rewards reminder posted');
    }
    catch (error) {
        logger.error({ error, guildId, gameId }, 'Failed to post rewards reminder');
    }
}
//# sourceMappingURL=rewardsReminder.js.map