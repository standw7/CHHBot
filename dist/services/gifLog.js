"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTRIBUTOR_DENIED = void 0;
exports.gifAccess = gifAccess;
exports.memberGifAccess = memberGifAccess;
exports.logLine = logLine;
exports.logGifAction = logGifAction;
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../db/queries.js");
const media_js_1 = require("./media.js");
const logger = (0, pino_1.default)({ name: 'gif-log' });
function gifAccess(isAdmin, roleIds, config) {
    if (isAdmin)
        return 'admin';
    const role = config?.gif_contributor_role_id;
    if (role && roleIds.includes(role))
        return 'contributor';
    return null;
}
/** gifAccess for a message author or interaction member (cached or raw API member). */
function memberGifAccess(member, permissions, guildId) {
    const roles = member?.roles;
    const roleIds = !roles ? [] : Array.isArray(roles) ? roles : [...roles.cache.keys()];
    return gifAccess(!!permissions?.has(discord_js_1.PermissionFlagsBits.ManageGuild), roleIds, (0, queries_js_1.getGuildConfig)(guildId));
}
exports.CONTRIBUTOR_DENIED = 'You need Manage Server permission or the gif contributor role.';
/** Text of a log message. Exported for tests. */
function logLine(actorId, action) {
    const who = `<@${actorId}>`;
    switch (action.kind) {
        case 'add':
            return `➕ ${who} added to **${action.entry.key}**`;
        case 'remove':
            return `🗑️ ${who} removed from **${action.entries[0].key}**`;
        case 'delete':
            return `💥 ${who} deleted key **${action.key}** (${action.entries.length} items)`;
        case 'rename':
            return `✏️ ${who} renamed **${action.oldKey}** → **${action.newKey}** (${action.count} items)`;
    }
}
/** One log message per entry: its saved file attached (so it survives removal), or its link. */
function entryPayload(header, entry, removed) {
    const abs = entry.file_path ? path_1.default.join(media_js_1.MEDIA_DIR, entry.file_path) : null;
    const restore = removed ? `\nTo restore, reply to this message with \`!gif add ${entry.key}\`` : '';
    if (abs && (0, fs_1.existsSync)(abs)) {
        // <url> suppresses the link's embed so a restore only picks up the attached file
        return {
            content: `${header}\n<${entry.url}>${restore}`,
            files: [{ attachment: abs, name: (0, media_js_1.displayFileName)(entry.file_path) }],
        };
    }
    // Link entries (Tenor etc.): left bare so Discord embeds it, which a restore picks up
    return { content: `${header}\n${entry.url}${restore}` };
}
/**
 * Posts a gif change to the configured log channel. No-op if none is set.
 * Never throws: a broken log channel must not break gif commands.
 */
async function logGifAction(client, guildId, actorId, action) {
    const channelId = (0, queries_js_1.getGuildConfig)(guildId)?.gif_log_channel_id;
    if (!channelId)
        return;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isSendable()) {
            logger.warn({ guildId, channelId }, 'Gif log channel missing or not sendable');
            return;
        }
        const allowedMentions = { parse: [] };
        const header = logLine(actorId, action);
        if (action.kind === 'add') {
            await channel.send({ ...entryPayload(header, action.entry, false), allowedMentions });
        }
        else if (action.kind === 'rename') {
            await channel.send({ content: header, allowedMentions });
        }
        else {
            if (action.kind === 'delete')
                await channel.send({ content: header, allowedMentions });
            for (const entry of action.entries) {
                const h = action.kind === 'delete' ? `↳ from **${entry.key}**` : header;
                await channel.send({ ...entryPayload(h, entry, true), allowedMentions });
            }
        }
    }
    catch (err) {
        logger.warn({ err, guildId, channelId }, 'Failed to post gif log');
    }
}
//# sourceMappingURL=gifLog.js.map