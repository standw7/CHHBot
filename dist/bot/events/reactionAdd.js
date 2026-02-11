"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReactionHandler = registerReactionHandler;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'hall-of-fame' });
// Emojis that can trigger HoF induction
const HOF_EMOJIS = ['🔥', '😂', '🤣'];
const DEFAULT_THRESHOLD = 8;
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
            // Build the HoF embed
            const embed = buildHofEmbed(message, guildId, channelId, messageId);
            // Post to HoF channel
            const hofChannel = await message.guild.channels.fetch(config.hof_channel_id);
            if (!hofChannel || !hofChannel.isTextBased()) {
                logger.error({ hofChannelId: config.hof_channel_id }, 'Hall of Fame channel not found or not text-based');
                return;
            }
            const hofMessage = await hofChannel.send({ embeds: [embed] });
            (0, queries_js_1.markMessageInducted)(guildId, messageId, channelId, hofMessage.id, config.hof_channel_id);
            logger.info({ guildId, messageId, channelId, emoji: emojiName, reactionCount: count }, 'Message inducted to Hall of Fame');
        }
        catch (error) {
            logger.error({ error }, 'Error in hall of fame reaction handler');
        }
    });
}
function buildHofEmbed(message, guildId, channelId, messageId) {
    const author = message.author;
    const content = message.content || '';
    const truncatedContent = content.length > 1500
        ? content.slice(0, 1500) + '... (truncated)'
        : content;
    const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
    const embed = new discord_js_1.EmbedBuilder()
        .setAuthor({
        name: author?.displayName ?? author?.username ?? 'Unknown',
        iconURL: author?.displayAvatarURL(),
    })
        .setDescription(truncatedContent || '*No text content*')
        .addFields({ name: 'Channel', value: `<#${channelId}>`, inline: false }, { name: 'Link', value: `[Jump to message](${messageUrl})`, inline: false })
        .setTimestamp(message.createdAt)
        .setColor(0xFF4500)
        .setFooter({ text: 'Hall of Fame Induction' });
    // Include first image attachment if present
    const attachments = Array.from(message.attachments.values());
    const imageAttachment = attachments.find(a => a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/'));
    if (imageAttachment) {
        if (imageAttachment.contentType?.startsWith('image/')) {
            embed.setImage(imageAttachment.url);
        }
        else {
            embed.addFields({ name: 'Attachment', value: `[${imageAttachment.name}](${imageAttachment.url})` });
        }
    }
    else if (attachments.length > 0) {
        const attachmentLinks = attachments.map(a => `[${a.name}](${a.url})`).join('\n');
        embed.addFields({ name: 'Attachments', value: attachmentLinks });
    }
    return embed;
}
//# sourceMappingURL=reactionAdd.js.map