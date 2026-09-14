"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_THRESHOLD = exports.HOF_EMOJIS = void 0;
exports.qualifiesForHof = qualifiesForHof;
exports.scanForMissedHof = scanForMissedHof;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../db/queries.js");
const logger = (0, pino_1.default)({ name: 'hof-scan' });
// Emojis that can trigger HoF induction. Shared by the reaction handler and the scanner
// so `services/` doesn't need to import from `bot/events/`.
exports.HOF_EMOJIS = ['🔥', '😂', '🤣'];
exports.DEFAULT_THRESHOLD = 8;
/**
 * True if any qualifying emoji's reaction count meets the threshold.
 * Pure — no network I/O — so it's unit tested directly.
 */
function qualifiesForHof(reactionCounts, threshold, hofEmojis) {
    return reactionCounts.some((r) => r.emojiName !== null && hofEmojis.includes(r.emojiName) && r.count >= threshold);
}
/**
 * Scan every text channel the bot can read in the guild for messages posted on or after
 * `sinceISO` that meet the HoF threshold but were never inducted. Used by `!hof scan` to
 * backfill messages the reaction handler missed (e.g. while the bot was offline).
 */
async function scanForMissedHof(guild, config, sinceISO) {
    const since = new Date(sinceISO).getTime();
    const threshold = config.hof_threshold ?? exports.DEFAULT_THRESHOLD;
    const candidates = [];
    const me = guild.members.me;
    const textChannels = guild.channels.cache.filter((channel) => channel.type === discord_js_1.ChannelType.GuildText && channel.id !== config.hof_channel_id);
    for (const channel of textChannels.values()) {
        if (!me?.permissionsIn(channel).has([discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory])) {
            continue;
        }
        let channelCount = 0;
        try {
            let before;
            for (;;) {
                const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
                if (page.size === 0)
                    break;
                for (const message of page.values()) {
                    if (message.createdTimestamp < since || message.author.bot)
                        continue;
                    const reactionCounts = message.reactions.cache.map((r) => ({
                        emojiName: r.emoji.name,
                        count: r.count,
                    }));
                    if (qualifiesForHof(reactionCounts, threshold, exports.HOF_EMOJIS) &&
                        !(0, queries_js_1.hasMessageBeenInducted)(guild.id, message.id)) {
                        const topCount = reactionCounts
                            .filter((r) => r.emojiName !== null && exports.HOF_EMOJIS.includes(r.emojiName))
                            .reduce((max, r) => Math.max(max, r.count), 0);
                        candidates.push({ message, channelName: channel.name, topCount });
                        channelCount++;
                    }
                }
                const oldest = page.last();
                if (!oldest)
                    break;
                before = oldest.id;
                if (oldest.createdTimestamp < since)
                    break;
                // Fewer than a full page means this was the last page of history — avoid an
                // extra round trip that would just come back empty.
                if (page.size < 100)
                    break;
            }
        }
        catch (error) {
            logger.warn({ error, channelId: channel.id }, 'Failed to scan channel for missed HoF messages');
            continue;
        }
        logger.info({ channelId: channel.id, channelName: channel.name, count: channelCount }, 'Scanned channel for missed HoF messages');
    }
    candidates.sort((a, b) => a.message.createdTimestamp - b.message.createdTimestamp);
    return candidates;
}
//# sourceMappingURL=hofScan.js.map