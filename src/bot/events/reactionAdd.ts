import { Client, EmbedBuilder, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { getGuildConfig, hasMessageBeenInducted, markMessageInducted } from '../../db/queries.js';
import pino from 'pino';

const logger = pino({ name: 'hall-of-fame' });

// Emojis that can trigger HoF induction
const HOF_EMOJIS = ['🔥', '😂', '🤣'];
const DEFAULT_THRESHOLD = 8;

export function registerReactionHandler(client: Client): void {
  client.on('messageReactionAdd', async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    try {
      // Fetch partial reaction if needed
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          logger.warn('Failed to fetch partial reaction');
          return;
        }
      }

      if (!reaction.message.guild) return;

      // Check if this is a qualifying emoji
      const emojiName = reaction.emoji.name;
      if (!emojiName || !HOF_EMOJIS.includes(emojiName)) return;

      const guildId = reaction.message.guild.id;
      const config = getGuildConfig(guildId);
      if (!config?.hof_channel_id) return;

      const messageId = reaction.message.id;
      const channelId = reaction.message.channel.id;

      // Don't induct messages from the HoF channel itself
      if (channelId === config.hof_channel_id) return;

      const threshold = config.hof_threshold ?? DEFAULT_THRESHOLD;
      const count = reaction.count ?? 0;
      if (count < threshold) return;

      // Check dedup
      if (hasMessageBeenInducted(guildId, messageId)) return;

      // Fetch the full message
      const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;

      // Build the HoF embed
      const author = message.author;
      const content = message.content || '';
      const truncatedContent = content.length > 1500
        ? content.slice(0, 1500) + '... (truncated)'
        : content;

      const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
      const channelName = 'name' in message.channel ? message.channel.name : 'unknown';

      const embed = new EmbedBuilder()
        .setAuthor({
          name: author?.displayName ?? author?.username ?? 'Unknown',
          iconURL: author?.displayAvatarURL(),
        })
        .setDescription(truncatedContent || '*No text content*')
        .addFields(
          { name: 'Channel', value: `<#${channelId}>`, inline: true },
          { name: 'Link', value: `[Jump to message](${messageUrl})`, inline: true },
          { name: `${emojiName} Reactions`, value: `${count}`, inline: true },
        )
        .setTimestamp(message.createdAt)
        .setColor(0xFF4500)
        .setFooter({ text: 'Hall of Fame Induction' });

      // Include first image attachment if present
      const imageAttachment = message.attachments.find(a =>
        a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/')
      );
      if (imageAttachment) {
        if (imageAttachment.contentType?.startsWith('image/')) {
          embed.setImage(imageAttachment.url);
        } else {
          embed.addFields({ name: 'Attachment', value: `[${imageAttachment.name}](${imageAttachment.url})` });
        }
      } else if (message.attachments.size > 0) {
        const attachmentLinks = message.attachments.map(a => `[${a.name}](${a.url})`).join('\n');
        embed.addFields({ name: 'Attachments', value: attachmentLinks });
      }

      // Post to HoF channel
      const hofChannel = await message.guild!.channels.fetch(config.hof_channel_id);
      if (!hofChannel || !hofChannel.isTextBased()) {
        logger.error({ hofChannelId: config.hof_channel_id }, 'Hall of Fame channel not found or not text-based');
        return;
      }

      await hofChannel.send({ embeds: [embed] });
      markMessageInducted(guildId, messageId, channelId);
      logger.info({ guildId, messageId, channelId, emoji: emojiName, reactionCount: count }, 'Message inducted to Hall of Fame');

    } catch (error) {
      logger.error({ error }, 'Error in hall of fame reaction handler');
    }
  });
}
