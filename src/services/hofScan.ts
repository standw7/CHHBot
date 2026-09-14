import { ChannelType, Guild, Message, PermissionFlagsBits, TextChannel } from 'discord.js';
import pino from 'pino';
import { hasMessageBeenInducted } from '../db/queries.js';
import type { GuildConfig } from '../db/models.js';
import { HOF_EMOJIS } from '../bot/events/reactionAdd.js';

const logger = pino({ name: 'hof-scan' });

export interface ReactionCount {
  emojiName: string | null;
  count: number;
}

/**
 * True if any qualifying emoji's reaction count meets the threshold.
 * Pure — no network I/O — so it's unit tested directly.
 */
export function qualifiesForHof(
  reactionCounts: ReactionCount[],
  threshold: number,
  hofEmojis: string[]
): boolean {
  return reactionCounts.some(
    (r) => r.emojiName !== null && hofEmojis.includes(r.emojiName) && r.count >= threshold
  );
}

export interface ScanCandidate {
  message: Message;
  channelName: string;
  topCount: number;
}

/**
 * Scan every text channel the bot can read in the guild for messages posted on or after
 * `sinceISO` that meet the HoF threshold but were never inducted. Used by `!hof scan` to
 * backfill messages the reaction handler missed (e.g. while the bot was offline).
 */
export async function scanForMissedHof(
  guild: Guild,
  config: GuildConfig,
  sinceISO: string
): Promise<ScanCandidate[]> {
  const since = new Date(sinceISO).getTime();
  const threshold = config.hof_threshold;
  const candidates: ScanCandidate[] = [];

  const me = guild.members.me;

  const textChannels = guild.channels.cache.filter(
    (channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText && channel.id !== config.hof_channel_id
  );

  for (const channel of textChannels.values()) {
    if (!me?.permissionsIn(channel).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
      continue;
    }

    let channelCount = 0;
    try {
      let before: string | undefined;

      for (;;) {
        const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (page.size === 0) break;

        for (const message of page.values()) {
          if (message.createdTimestamp < since || message.author.bot) continue;

          const reactionCounts: ReactionCount[] = message.reactions.cache.map((r) => ({
            emojiName: r.emoji.name,
            count: r.count,
          }));

          if (
            qualifiesForHof(reactionCounts, threshold, HOF_EMOJIS) &&
            !hasMessageBeenInducted(guild.id, message.id)
          ) {
            const topCount = reactionCounts
              .filter((r) => r.emojiName !== null && HOF_EMOJIS.includes(r.emojiName))
              .reduce((max, r) => Math.max(max, r.count), 0);
            candidates.push({ message, channelName: channel.name, topCount });
            channelCount++;
          }
        }

        const oldest = page.last();
        if (!oldest) break;
        before = oldest.id;
        if (oldest.createdTimestamp < since) break;
      }
    } catch (error) {
      logger.warn({ error, channelId: channel.id }, 'Failed to scan channel for missed HoF messages');
      continue;
    }

    logger.info({ channelId: channel.id, channelName: channel.name, count: channelCount }, 'Scanned channel for missed HoF messages');
  }

  candidates.sort((a, b) => a.message.createdTimestamp - b.message.createdTimestamp);
  return candidates;
}
