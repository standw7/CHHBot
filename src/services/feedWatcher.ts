import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import RssParser from 'rss-parser';
import pino from 'pino';
import { getFeedSources, updateFeedLastItem, getGuildConfig, hasFeedItemBeenPosted, markFeedItemPosted, cleanupOldFeedItems } from '../db/queries.js';

// fxtwitter API response types
interface FxTwitterAuthor {
  name: string;
  screen_name: string;
  avatar_url: string;
  banner_url?: string;
}

interface FxTwitterMedia {
  photos?: Array<{ url: string; width: number; height: number }>;
  videos?: Array<{ url: string; thumbnail_url: string }>;
}

interface FxTwitterQuote {
  url: string;
  text: string;
  author: FxTwitterAuthor;
  media?: FxTwitterMedia;
}

interface FxTwitterTweet {
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;
  author: FxTwitterAuthor;
  media?: FxTwitterMedia;
  replies: number;
  retweets: number;
  likes: number;
  quote?: FxTwitterQuote;
}

interface FxTwitterResponse {
  code: number;
  message: string;
  tweet?: FxTwitterTweet;
}

const logger = pino({ name: 'feed-watcher' });
const parser = new RssParser();

const POLL_INTERVAL = 5 * 60_000; // 5 minutes
const CLEANUP_INTERVAL = 24 * 60 * 60_000; // 24 hours
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// Normalize an RSS item into a stable, canonical ID for dedup.
// For Twitter/X URLs, extract the numeric tweet ID (immune to domain/path changes).
// Falls back to guid → link → title.
function normalizeItemId(item: RssParser.Item): string {
  const link = item.link || '';
  // Extract numeric tweet ID from twitter.com/x.com URLs
  const tweetMatch = link.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i);
  if (tweetMatch) return `tweet:${tweetMatch[1]}`;

  // For non-Twitter items, prefer guid, then link, then title
  return item.guid || item.link || item.title || '';
}

// Fetch tweet data from fxtwitter API
async function fetchTweetData(tweetUrl: string): Promise<FxTwitterResponse['tweet'] | null> {
  try {
    // Extract username and tweet ID from URL
    // Handles: twitter.com/user/status/123, x.com/user/status/123
    const match = tweetUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/i);
    if (!match) return null;

    const [, username, tweetId] = match;
    const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;

    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
    });

    if (!response.ok) {
      logger.warn({ tweetUrl, status: response.status }, 'fxtwitter API error');
      return null;
    }

    const data = await response.json() as FxTwitterResponse;
    if (data.code !== 200 || !data.tweet) {
      logger.warn({ tweetUrl, code: data.code, message: data.message }, 'fxtwitter API returned error');
      return null;
    }

    return data.tweet;
  } catch (error) {
    logger.error({ err: error, tweetUrl }, 'Failed to fetch tweet data');
    return null;
  }
}

// Extract image URL from RSS item - checks multiple sources
function extractImageFromItem(item: RssParser.Item): string | null {
  const itemAny = item as Record<string, unknown>;

  // 1. Check enclosure (standard RSS)
  const enclosure = itemAny.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && enclosure.type?.startsWith('image')) {
    return enclosure.url;
  }

  // 2. Check media:content (common in RSS feeds)
  const mediaContent = itemAny['media:content'] as { $?: { url?: string; medium?: string } } | undefined;
  if (mediaContent?.$?.url && (!mediaContent.$.medium || mediaContent.$.medium === 'image')) {
    return mediaContent.$.url;
  }

  // 3. Check media:thumbnail
  const mediaThumbnail = itemAny['media:thumbnail'] as { $?: { url?: string } } | undefined;
  if (mediaThumbnail?.$?.url) {
    return mediaThumbnail.$.url;
  }

  // 4. Extract from HTML content (look for <img> tags)
  const content = item.content || item.summary || '';
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) {
    // Skip small images (likely emojis or icons)
    const imgUrl = imgMatch[1];
    if (!imgUrl.includes('emoji') && !imgUrl.includes('icon') && !imgUrl.includes('avatar')) {
      return imgUrl;
    }
  }

  // 5. Look for video poster/thumbnail in content
  const videoMatch = content.match(/<video[^>]+poster=["']([^"']+)["']/i);
  if (videoMatch?.[1]) {
    return videoMatch[1];
  }

  // 6. Check for pbs.twimg.com URLs in content (Twitter media)
  const twimgMatch = content.match(/https:\/\/pbs\.twimg\.com\/media\/[^\s"'<>]+/i);
  if (twimgMatch?.[0]) {
    return twimgMatch[0];
  }

  return null;
}

export function startFeedWatcher(client: Client): void {
  if (pollTimer) return;
  logger.info('Starting feed watcher');
  // Initial poll after 30s to let bot fully start
  setTimeout(() => pollAllFeeds(client), 30_000);
  pollTimer = setInterval(() => pollAllFeeds(client), POLL_INTERVAL);

  // Periodic cleanup of old posted_feed_items entries (every 24h)
  cleanupTimer = setInterval(() => {
    const removed = cleanupOldFeedItems(30);
    if (removed > 0) logger.info({ removed }, 'Cleaned up old posted feed items');
  }, CLEANUP_INTERVAL);
}

/** Force-poll all feeds for a specific guild. Returns a summary of what happened. */
export async function forceCheckFeeds(
  client: Client,
  guildId: string,
  targetLabel?: string,
): Promise<string[]> {
  const config = getGuildConfig(guildId);
  if (!config?.news_channel_id) return ['No news channel configured.'];

  const feeds = getFeedSources(guildId);
  if (feeds.length === 0) return ['No feeds registered.'];

  const results: string[] = [];

  for (const feed of feeds) {
    if (targetLabel && feed.label !== targetLabel) continue;

    try {
      let rssFeed;
      try {
        rssFeed = await parser.parseURL(feed.url);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        results.push(`❌ **${feed.label}** — RSS parse failed: ${msg.slice(0, 100)}`);
        continue;
      }

      const itemCount = rssFeed.items?.length || 0;
      if (itemCount === 0) {
        results.push(`⚠️ **${feed.label}** — Feed returned 0 items`);
        continue;
      }

      // Run the normal poll logic
      await pollFeed(client, guildId, config.news_channel_id, feed.id, feed.url, feed.label, feed.last_item_id);
      const latest = rssFeed.items![0];
      const latestTitle = latest?.title?.slice(0, 60) || latest?.link || 'No title';
      results.push(`✅ **${feed.label}** — ${itemCount} items, latest: "${latestTitle}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      results.push(`❌ **${feed.label}** — Error: ${msg.slice(0, 100)}`);
    }
  }

  if (targetLabel && results.length === 0) {
    results.push(`Feed "${targetLabel}" not found.`);
  }

  return results;
}

export function stopFeedWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
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

  if (!rssFeed.items || rssFeed.items.length === 0) {
    logger.info({ feedLabel, feedUrl }, 'Feed returned no items');
    return;
  }

  // Find new items since last check
  const items = rssFeed.items;
  let newItems: typeof items = [];

  if (!lastItemId) {
    // First poll - post the most recent item, but seed all OTHER items
    // into the dedup table so they're never reposted if the marker is lost
    logger.info({ feedLabel, totalItems: items.length }, 'First poll for feed, seeding dedup table');
    // Seed items[1..n] into dedup (skip items[0] so it passes the dedup filter and gets posted)
    for (let i = 1; i < items.length; i++) {
      const nid = normalizeItemId(items[i]);
      if (nid) markFeedItemPosted(guildId, feedId, nid);
    }
    newItems = items.slice(0, 1);
  } else {
    // Find items newer than our last seen
    let foundLastItem = false;
    for (const item of items) {
      const itemId = item.guid || item.link || item.title || '';
      if (itemId === lastItemId) {
        foundLastItem = true;
        break;
      }
      newItems.push(item);
    }

    // If we didn't find the lastItemId, the item may have aged out of the feed
    // Only post items from the last 2 hours to avoid flooding with old content
    if (!foundLastItem && newItems.length > 0) {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const recentItems = newItems.filter(item => {
        if (!item.pubDate) return false;
        const itemTime = new Date(item.pubDate).getTime();
        return itemTime > twoHoursAgo;
      });

      if (recentItems.length < newItems.length) {
        logger.info(
          { feedLabel, totalNew: newItems.length, recentNew: recentItems.length },
          'lastItemId not found in feed, filtering to recent items only'
        );
        newItems = recentItems;
      }
    }

    // Cap at 3 to avoid flooding
    newItems = newItems.slice(0, 3);
  }

  // Hard dedup: filter out any items we've already posted (by normalized ID)
  const beforeDedup = newItems.length;
  newItems = newItems.filter(item => {
    const nid = normalizeItemId(item);
    if (!nid) return false;
    return !hasFeedItemBeenPosted(guildId, feedId, nid);
  });

  if (beforeDedup > 0 && newItems.length < beforeDedup) {
    logger.info(
      { feedLabel, before: beforeDedup, after: newItems.length },
      'Dedup filtered out already-posted items'
    );
  }

  if (newItems.length === 0) {
    // Even with no new items to post, still update the marker if feed has items
    const latestItem = items[0];
    const latestId = latestItem.guid || latestItem.link || latestItem.title || '';
    if (latestId) updateFeedLastItem(feedId, latestId);
    logger.debug({ feedLabel }, 'No new items to post');
    return;
  }

  // Post in chronological order (oldest first)
  newItems.reverse();

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.error({ channelId }, 'News channel not found');
    return;
  }

  const textChannel = channel as TextChannel;

  for (const item of newItems) {
    const nid = normalizeItemId(item);

    // Check if this is a Twitter/X feed
    const isTwitterFeed = feedUrl.includes('twitter') ||
      feedUrl.includes('/x.com') ||
      (item.link && /twitter\.com|x\.com/i.test(item.link));

    if (isTwitterFeed && item.link) {
      await postTwitterItem(textChannel, item, rssFeed, feedLabel);
    } else {
      await postGenericItem(textChannel, item, rssFeed, feedLabel);
    }

    // Mark as posted in dedup table
    if (nid) markFeedItemPosted(guildId, feedId, nid);
  }

  // Update last seen item ID
  const latestItem = items[0];
  const latestId = latestItem.guid || latestItem.link || latestItem.title || '';
  if (latestId) {
    updateFeedLastItem(feedId, latestId);
  }

  logger.info({ guildId, feedLabel, newCount: newItems.length }, 'Posted new feed items');
}

async function postTwitterItem(
  channel: TextChannel,
  item: RssParser.Item,
  rssFeed: RssParser.Output<RssParser.Item>,
  feedLabel: string
): Promise<void> {
  try {
    const tweetUrl = item.link || '';

    // Try to fetch rich tweet data from fxtwitter API
    const tweetData = tweetUrl ? await fetchTweetData(tweetUrl) : null;

    if (tweetData) {
      // Check if this is a retweet (tweet author doesn't match feed account)
      const feedHandle = feedLabel.replace(/^@/, '').toLowerCase();
      const tweetAuthor = tweetData.author.screen_name.toLowerCase();
      const isRetweet = feedHandle !== tweetAuthor && feedHandle.length > 0;

      // We have rich tweet data - build a proper embed
      const embed = new EmbedBuilder()
        .setColor(0x000000) // Black like X/Twitter
        .setAuthor({
          name: `${tweetData.author.name} (@${tweetData.author.screen_name})`,
          iconURL: tweetData.author.avatar_url,
          url: `https://x.com/${tweetData.author.screen_name}`,
        })
        .setURL(tweetUrl);

      // Add retweet indicator if applicable
      let description = tweetData.text;
      if (isRetweet) {
        description = `🔁 **Retweeted by @${feedLabel.replace(/^@/, '')}**\n\n${tweetData.text}`;
      }
      embed.setDescription(description);

      // Add quoted tweet if present
      if (tweetData.quote) {
        const q = tweetData.quote;
        // Author line links to the quoted tweet, quote text in blockquote below
        let quoteText = `[**${q.author.name}** (@${q.author.screen_name})](${q.url})\n`;
        const quoteLines = q.text.split('\n').map(line => `> ${line}`).join('\n');
        quoteText += quoteLines;

        embed.addFields({
          name: 'Quoting',
          value: quoteText,
          inline: false,
        });

        // If quoted tweet has media and main tweet doesn't, show quoted media
        if (!tweetData.media?.photos && !tweetData.media?.videos) {
          if (q.media?.photos && q.media.photos.length > 0) {
            embed.setImage(q.media.photos[0].url);
          } else if (q.media?.videos && q.media.videos.length > 0) {
            embed.setImage(q.media.videos[0].thumbnail_url);
          }
        }
      }

      // Add media if present - prefer photos, fall back to video thumbnail
      if (tweetData.media?.photos && tweetData.media.photos.length > 0) {
        embed.setImage(tweetData.media.photos[0].url);
      } else if (tweetData.media?.videos && tweetData.media.videos.length > 0) {
        embed.setImage(tweetData.media.videos[0].thumbnail_url);
      }

      // Format engagement numbers (1234 -> 1.2K)
      const formatCount = (n: number): string => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return n.toString();
      };

      const stats = [
        `💬 ${formatCount(tweetData.replies)}`,
        `🔁 ${formatCount(tweetData.retweets)}`,
        `❤️ ${formatCount(tweetData.likes)}`,
      ].join('  ');

      // Footer with engagement stats, timestamp shows on hover via setTimestamp
      embed.setFooter({
        text: `${stats}  •  𝕏`,
      });

      // Add Discord timestamp (shows in viewer's local timezone on hover)
      const tweetTime = new Date(tweetData.created_timestamp * 1000);
      embed.setTimestamp(tweetTime);

      // Post embed with a link to the original tweet below it
      await channel.send({
        embeds: [embed],
        components: [
          {
            type: 1, // ActionRow
            components: [
              {
                type: 2, // Button
                style: 5, // Link
                label: 'View Original on 𝕏',
                url: tweetUrl,
              },
            ],
          },
        ],
      });
    } else {
      // Fallback: use RSS data if API fails
      const handleMatch = tweetUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status/i);
      const handle = handleMatch?.[1] || feedLabel.replace('@', '');
      const displayName = item.creator || rssFeed.title || handle;

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setAuthor({ name: `${displayName} (@${handle})` })
        .setURL(tweetUrl);

      // Tweet text as description
      let desc = item.contentSnippet || item.content || item.summary || '';
      desc = desc.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      desc = desc.replace(/\s+/g, ' ').trim();
      if (desc.length > 500) desc = desc.slice(0, 500) + '...';
      if (desc) embed.setDescription(desc);

      // Footer with timestamp
      const timestamp = item.pubDate ? new Date(item.pubDate) : new Date();
      embed.setFooter({ text: '𝕏' });
      embed.setTimestamp(timestamp);

      // Extract images from RSS
      const imageUrl = extractImageFromItem(item);
      if (imageUrl) {
        embed.setImage(imageUrl);
      }

      await channel.send({
        embeds: [embed],
        components: tweetUrl
          ? [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: 'View Original on 𝕏',
                    url: tweetUrl,
                  },
                ],
              },
            ]
          : [],
      });
    }
  } catch (error) {
    logger.error({ err: error, feedLabel }, 'Failed to post Twitter item');
  }
}

async function postGenericItem(
  channel: TextChannel,
  item: RssParser.Item,
  rssFeed: RssParser.Output<RssParser.Item>,
  feedLabel: string
): Promise<void> {
  try {
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

    // Extract images from various sources
    const imageUrl = extractImageFromItem(item);
    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    // Convert twitter/x.com links to fxtwitter for proper Discord embeds
    let linkContent = item.link || undefined;
    if (linkContent) {
      linkContent = linkContent.replace(/https?:\/\/(www\.)?(x\.com|twitter\.com)\//gi, 'https://fxtwitter.com/');
    }
    await channel.send({ content: linkContent, embeds: [embed] });
  } catch (error) {
    logger.error({ err: error, feedLabel }, 'Failed to post feed item');
  }
}
