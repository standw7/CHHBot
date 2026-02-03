import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import RssParser from 'rss-parser';
import pino from 'pino';
import { getFeedSources, updateFeedLastItem, getGuildConfig } from '../db/queries.js';

const logger = pino({ name: 'feed-watcher' });
const parser = new RssParser();

const POLL_INTERVAL = 5 * 60_000; // 5 minutes
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startFeedWatcher(client: Client): void {
  if (pollTimer) return;
  logger.info('Starting feed watcher');
  // Initial poll after 30s to let bot fully start
  setTimeout(() => pollAllFeeds(client), 30_000);
  pollTimer = setInterval(() => pollAllFeeds(client), POLL_INTERVAL);
}

export function stopFeedWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  logger.info('Stopped feed watcher');
}

async function pollAllFeeds(client: Client): Promise<void> {
  for (const [guildId] of client.guilds.cache) {
    const config = getGuildConfig(guildId);
    if (!config?.news_channel_id) continue;

    const feeds = getFeedSources(guildId);
    if (feeds.length === 0) continue;

    for (const feed of feeds) {
      try {
        await pollFeed(client, guildId, config.news_channel_id, feed.id, feed.url, feed.label, feed.last_item_id);
      } catch (error) {
        logger.error({ err: error, feedId: feed.id, url: feed.url }, 'Error polling feed');
      }
    }
  }
}

async function pollFeed(
  client: Client,
  guildId: string,
  channelId: string,
  feedId: number,
  feedUrl: string,
  feedLabel: string,
  lastItemId: string | null,
): Promise<void> {
  let rssFeed;
  try {
    rssFeed = await parser.parseURL(feedUrl);
  } catch (error) {
    logger.warn({ err: error, feedUrl }, 'Failed to parse feed');
    return;
  }

  if (!rssFeed.items || rssFeed.items.length === 0) return;

  // Find new items since last check
  const items = rssFeed.items;
  let newItems: typeof items = [];

  if (!lastItemId) {
    // First poll - just post the most recent item and save the marker
    newItems = items.slice(0, 1);
  } else {
    // Find items newer than our last seen
    for (const item of items) {
      const itemId = item.guid || item.link || item.title || '';
      if (itemId === lastItemId) break;
      newItems.push(item);
    }
    // Cap at 5 to avoid flooding on first run or after long downtime
    newItems = newItems.slice(0, 5);
  }

  if (newItems.length === 0) return;

  // Post in chronological order (oldest first)
  newItems.reverse();

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.error({ channelId }, 'News channel not found');
    return;
  }

  const textChannel = channel as TextChannel;

  for (const item of newItems) {
    const embed = new EmbedBuilder()
      .setColor(0x1DA1F2);

    if (item.title) embed.setTitle(item.title);
    if (item.link) embed.setURL(item.link);

    // Build description from content snippet
    let desc = item.contentSnippet || item.content || item.summary || '';
    if (desc.length > 500) desc = desc.slice(0, 500) + '...';
    if (desc) embed.setDescription(desc);

    if (item.creator || rssFeed.title) {
      embed.setAuthor({ name: item.creator || rssFeed.title || feedLabel });
    }

    if (item.pubDate) {
      embed.setTimestamp(new Date(item.pubDate));
    }

    embed.setFooter({ text: feedLabel });

    // Check for images in enclosure or media
    const enclosure = (item as Record<string, unknown>).enclosure as { url?: string; type?: string } | undefined;
    if (enclosure?.url && enclosure.type?.startsWith('image')) {
      embed.setImage(enclosure.url);
    }

    try {
      // If the item has a link, also post it as plain text for Discord to embed natively
      const content = item.link ? item.link : undefined;
      await textChannel.send({ content, embeds: [embed] });
    } catch (error) {
      logger.error({ err: error, feedLabel }, 'Failed to post feed item');
    }
  }

  // Update last seen item ID
  const latestItem = items[0];
  const latestId = latestItem.guid || latestItem.link || latestItem.title || '';
  if (latestId) {
    updateFeedLastItem(feedId, latestId);
  }

  logger.info({ guildId, feedLabel, newCount: newItems.length }, 'Posted new feed items');
}
