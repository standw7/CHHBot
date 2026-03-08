import { Client, EmbedBuilder, Message, MessageReaction, PartialMessageReaction, User, PartialUser, TextChannel, AttachmentBuilder } from 'discord.js';
import { getGuildConfig, hasMessageBeenInducted, markMessageInducted, updateHofFollowup } from '../../db/queries.js';
import pino from 'pino';

const logger = pino({ name: 'hall-of-fame' });

// Emojis that can trigger HoF induction
const HOF_EMOJIS = ['🔥', '😂', '🤣'];
const DEFAULT_THRESHOLD = 8;

// Regex to match Twitter/X links
const TWITTER_LINK_RE = /https?:\/\/(www\.)?(x\.com|twitter\.com)\/([\w/]+\/status\/\d+\S*)/gi;

export interface HofPostData {
  embed: EmbedBuilder;
  fxLinks: string[];
  files: AttachmentBuilder[];
}

/**
 * Build a full HOF post from a Discord message.
 * Returns the embed, any fxtwitter links (to send as a separate follow-up), and file attachments.
 * Exported so the backfill command can reuse it.
 */
export async function buildHofPost(
  message: Message,
  guildId: string,
  channelId: string,
  messageId: string
): Promise<HofPostData> {
  const author = message.author;
  const msgContent = message.content || '';
  const truncatedContent = msgContent.length > 1500
    ? msgContent.slice(0, 1500) + '... (truncated)'
    : msgContent;

  const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: author?.displayName ?? author?.username ?? 'Unknown',
      iconURL: author?.displayAvatarURL(),
    })
    .setDescription(truncatedContent || '*No text content*')
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
    } catch {
      logger.warn({ messageId }, 'Failed to fetch replied-to message for HOF post');
    }
  }

  // --- Channel and Link (always at bottom) ---
  embed.addFields(
    { name: 'Channel', value: `<#${channelId}>`, inline: false },
    { name: 'Link', value: `[Jump to message](${messageUrl})`, inline: false },
  );

  // --- Media attachments ---
  const attachments = Array.from(message.attachments.values());
  const imageAttachment = attachments.find(a => a.contentType?.startsWith('image/'));
  const videoAttachments = attachments.filter(a => a.contentType?.startsWith('video/'));
  const otherAttachments = attachments.filter(a =>
    !a.contentType?.startsWith('image/') && !a.contentType?.startsWith('video/')
  );

  // Embed first image
  if (imageAttachment) {
    embed.setImage(imageAttachment.url);
  }

  // List all remaining image attachments (after the first) as links
  const remainingImages = attachments.filter(a =>
    a.contentType?.startsWith('image/') && a.id !== imageAttachment?.id
  );
  if (remainingImages.length > 0) {
    const links = remainingImages.map(a => `[${a.name ?? 'Image'}](${a.url})`).join('\n');
    embed.addFields({ name: 'Images', value: links, inline: false });
  }

  // Attach videos as files so they play inline
  const files: AttachmentBuilder[] = [];
  for (const vid of videoAttachments) {
    try {
      files.push(new AttachmentBuilder(vid.url, { name: vid.name ?? 'video.mp4' }));
    } catch {
      logger.warn({ url: vid.url }, 'Failed to attach video for HOF post');
    }
  }

  // Link any other attachments
  if (otherAttachments.length > 0) {
    const links = otherAttachments.map(a => `[${a.name ?? 'File'}](${a.url})`).join('\n');
    embed.addFields({ name: 'Attachments', value: links, inline: false });
  }

  // --- Twitter/X link extraction ---
  const fxLinks: string[] = [];
  TWITTER_LINK_RE.lastIndex = 0;
  let match;
  while ((match = TWITTER_LINK_RE.exec(msgContent)) !== null) {
    const fxUrl = `https://fxtwitter.com/${match[3]}`;
    fxLinks.push(fxUrl);
  }

  return { embed, fxLinks, files };
}

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

      // Check if already inducted - skip if so (no duplicates)
      if (hasMessageBeenInducted(guildId, messageId)) return;

      // Need to meet threshold for initial induction
      if (count < threshold) return;

      // Fetch the full message
      const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;

      // Build the HoF post
      const { embed, fxLinks, files } = await buildHofPost(message, guildId, channelId, messageId);

      // Post to HoF channel
      const hofChannel = await message.guild!.channels.fetch(config.hof_channel_id);
      if (!hofChannel || !hofChannel.isTextBased()) {
        logger.error({ hofChannelId: config.hof_channel_id }, 'Hall of Fame channel not found or not text-based');
        return;
      }

      const tc = hofChannel as TextChannel;

      // Send the main HOF embed
      const hofMessage = await tc.send({ embeds: [embed], files });
      markMessageInducted(guildId, messageId, channelId, hofMessage.id, config.hof_channel_id);

      // Send fxtwitter links as a follow-up message (so Discord auto-embeds them)
      if (fxLinks.length > 0) {
        const followup = await tc.send({ content: fxLinks.join('\n') });
        updateHofFollowup(guildId, messageId, followup.id);
      }

      logger.info({ guildId, messageId, channelId, emoji: emojiName, reactionCount: count }, 'Message inducted to Hall of Fame');

    } catch (error) {
      logger.error({ error }, 'Error in hall of fame reaction handler');
    }
  });
}
