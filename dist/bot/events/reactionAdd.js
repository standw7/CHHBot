"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHofPost = buildHofPost;
exports.registerReactionHandler = registerReactionHandler;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'hall-of-fame' });
// Emojis that can trigger HoF induction
const HOF_EMOJIS = ['🔥', '😂', '🤣'];
const DEFAULT_THRESHOLD = 8;
// Social link patterns: match all variants (original + embed-fix domains), normalize to embed-fix URL
const SOCIAL_LINK_PATTERNS = [
    {
        // Twitter/X (all variants) — group 3 = user/status/id path
        re: /https?:\/\/(www\.)?(x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|xcancel\.com|fixupx\.com|twittpr\.com)\/([\w/]+\/status\/\d+\S*)/gi,
        toEmbedUrl: (m) => `https://fxtwitter.com/${m[3]}`,
    },
    {
        // Instagram (all variants) — group 3 = p|reel|reels, group 4 = post id
        re: /https?:\/\/(www\.)?(instagram\.com|ddinstagram\.com)\/(p|reel|reels)\/([\w-]+\S*)/gi,
        toEmbedUrl: (m) => `https://ddinstagram.com/${m[3]}/${m[4]}`,
    },
    {
        // TikTok (all variants) — group 3 = path after domain
        re: /https?:\/\/(www\.|vm\.)?(tiktok\.com|vxtiktok\.com|tiktxk\.com)\/(\S+)/gi,
        toEmbedUrl: (m) => `https://vxtiktok.com/${m[3]}`,
    },
];
/**
 * Build a full HOF post from a Discord message.
 * Returns the embed, any fxtwitter links (to send as a separate follow-up), and file attachments.
 * Exported so the backfill command can reuse it.
 */
async function buildHofPost(message, guildId, channelId, messageId) {
    const author = message.author;
    const msgContent = message.content || '';
    const truncatedContent = msgContent.length > 1500
        ? msgContent.slice(0, 1500) + '... (truncated)'
        : msgContent;
    const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
    // Build a description — if there's no text, describe what's attached
    const attachments = Array.from(message.attachments.values());
    let description = truncatedContent;
    if (!description) {
        const hasVideo = attachments.some(a => a.contentType?.startsWith('video/'));
        const hasImage = attachments.some(a => a.contentType?.startsWith('image/'));
        if (hasVideo && hasImage)
            description = '📎 Media attached';
        else if (hasVideo)
            description = '🎬 Video attached';
        else if (hasImage)
            description = '🖼 Image attached';
        else if (attachments.length > 0)
            description = '📎 Attachment';
        else
            description = '*No text content*';
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setAuthor({
        name: author?.displayName ?? author?.username ?? 'Unknown',
        iconURL: author?.displayAvatarURL(),
    })
        .setDescription(description)
        .setColor(0xFF4500)
        .setTimestamp(message.createdAt);
    // --- Reply context ---
    if (message.reference) {
        try {
            const repliedTo = await message.fetchReference();
            const replyAuthor = repliedTo.author?.displayName ?? repliedTo.author?.username ?? 'Unknown';
            let replyContent = repliedTo.content || '*No text content*';
            if (replyContent.length > 300) {
                replyContent = replyContent.slice(0, 300) + '... (truncated)';
            }
            embed.addFields({
                name: `↩ Reply to ${replyAuthor}`,
                value: replyContent,
                inline: false,
            });
        }
        catch {
            logger.warn({ messageId }, 'Failed to fetch replied-to message for HOF post');
        }
    }
    // --- Channel and Link (always at bottom) ---
    embed.addFields({ name: 'Channel', value: `<#${channelId}>`, inline: false }, { name: 'Link', value: `[Jump to message](${messageUrl})`, inline: false });
    // --- Media attachments ---
    const imageAttachment = attachments.find(a => a.contentType?.startsWith('image/'));
    const videoAttachments = attachments.filter(a => a.contentType?.startsWith('video/'));
    const otherAttachments = attachments.filter(a => !a.contentType?.startsWith('image/') && !a.contentType?.startsWith('video/'));
    // Embed first image
    if (imageAttachment) {
        embed.setImage(imageAttachment.url);
    }
    // List all remaining image attachments (after the first) as links
    const remainingImages = attachments.filter(a => a.contentType?.startsWith('image/') && a.id !== imageAttachment?.id);
    if (remainingImages.length > 0) {
        const links = remainingImages.map(a => `[${a.name ?? 'Image'}](${a.url})`).join('\n');
        embed.addFields({ name: 'Images', value: links, inline: false });
    }
    // Attach videos as files so they play inline
    const files = [];
    for (const vid of videoAttachments) {
        try {
            files.push(new discord_js_1.AttachmentBuilder(vid.url, { name: vid.name ?? 'video.mp4' }));
        }
        catch {
            logger.warn({ url: vid.url }, 'Failed to attach video for HOF post');
        }
    }
    // Link any other attachments
    if (otherAttachments.length > 0) {
        const links = otherAttachments.map(a => `[${a.name ?? 'File'}](${a.url})`).join('\n');
        embed.addFields({ name: 'Attachments', value: links, inline: false });
    }
    // --- Social link extraction (deduplicate by resolved URL) ---
    const embedLinks = [];
    const seenUrls = new Set();
    for (const { re, toEmbedUrl } of SOCIAL_LINK_PATTERNS) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(msgContent)) !== null) {
            const embedUrl = toEmbedUrl(match);
            if (!seenUrls.has(embedUrl)) {
                seenUrls.add(embedUrl);
                embedLinks.push(embedUrl);
            }
        }
    }
    return { embed, embedLinks, files };
}
function registerReactionHandler(client) {
    client.on('messageReactionAdd', async (reaction, user) => {
        try {
            // Fetch partial reaction if needed
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                }
                catch {
                    logger.warn('Failed to fetch partial reaction');
                    return;
                }
            }
            if (!reaction.message.guild)
                return;
            // Check if this is a qualifying emoji
            const emojiName = reaction.emoji.name;
            if (!emojiName || !HOF_EMOJIS.includes(emojiName))
                return;
            const guildId = reaction.message.guild.id;
            const config = (0, queries_js_1.getGuildConfig)(guildId);
            if (!config?.hof_channel_id)
                return;
            const messageId = reaction.message.id;
            const channelId = reaction.message.channel.id;
            // Don't induct messages from the HoF channel itself
            if (channelId === config.hof_channel_id)
                return;
            const threshold = config.hof_threshold ?? DEFAULT_THRESHOLD;
            const count = reaction.count ?? 0;
            // Check if already inducted - skip if so (no duplicates)
            if ((0, queries_js_1.hasMessageBeenInducted)(guildId, messageId))
                return;
            // Need to meet threshold for initial induction
            if (count < threshold)
                return;
            // Fetch the full message
            const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
            // Build the HoF post
            const { embed, embedLinks, files } = await buildHofPost(message, guildId, channelId, messageId);
            // Post to HoF channel
            const hofChannel = await message.guild.channels.fetch(config.hof_channel_id);
            if (!hofChannel || !hofChannel.isTextBased()) {
                logger.error({ hofChannelId: config.hof_channel_id }, 'Hall of Fame channel not found or not text-based');
                return;
            }
            const tc = hofChannel;
            // Send the main HOF embed (no files — videos go in follow-up so they render below)
            const hofMessage = await tc.send({ embeds: [embed] });
            (0, queries_js_1.markMessageInducted)(guildId, messageId, channelId, hofMessage.id, config.hof_channel_id);
            // Send follow-up with fxtwitter links and/or video files (renders below the card)
            if (embedLinks.length > 0 || files.length > 0) {
                const followup = await tc.send({
                    content: embedLinks.length > 0 ? embedLinks.join('\n') : undefined,
                    files,
                });
                (0, queries_js_1.updateHofFollowup)(guildId, messageId, followup.id);
            }
            logger.info({ guildId, messageId, channelId, emoji: emojiName, reactionCount: count }, 'Message inducted to Hall of Fame');
        }
        catch (error) {
            logger.error({ error }, 'Error in hall of fame reaction handler');
        }
    });
}
//# sourceMappingURL=reactionAdd.js.map