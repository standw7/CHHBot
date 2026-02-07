"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFeedWatcher = startFeedWatcher;
exports.stopFeedWatcher = stopFeedWatcher;
const discord_js_1 = require("discord.js");
const rss_parser_1 = __importDefault(require("rss-parser"));
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../db/queries.js");
const logger = (0, pino_1.default)({ name: 'feed-watcher' });
const parser = new rss_parser_1.default();
const POLL_INTERVAL = 5 * 60_000; // 5 minutes
let pollTimer = null;
// Extract image URL from RSS item - checks multiple sources
function extractImageFromItem(item) {
    const itemAny = item;
    // 1. Check enclosure (standard RSS)
    const enclosure = itemAny.enclosure;
    if (enclosure?.url && enclosure.type?.startsWith('image')) {
        return enclosure.url;
    }
    // 2. Check media:content (common in RSS feeds)
    const mediaContent = itemAny['media:content'];
    if (mediaContent?.$?.url && (!mediaContent.$.medium || mediaContent.$.medium === 'image')) {
        return mediaContent.$.url;
    }
    // 3. Check media:thumbnail
    const mediaThumbnail = itemAny['media:thumbnail'];
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
function startFeedWatcher(client) {
    if (pollTimer)
        return;
    logger.info('Starting feed watcher');
    // Initial poll after 30s to let bot fully start
    setTimeout(() => pollAllFeeds(client), 30_000);
    pollTimer = setInterval(() => pollAllFeeds(client), POLL_INTERVAL);
}
function stopFeedWatcher() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    logger.info('Stopped feed watcher');
}
async function pollAllFeeds(client) {
    for (const [guildId] of client.guilds.cache) {
        const config = (0, queries_js_1.getGuildConfig)(guildId);
        if (!config?.news_channel_id)
            continue;
        const feeds = (0, queries_js_1.getFeedSources)(guildId);
        if (feeds.length === 0)
            continue;
        for (const feed of feeds) {
            try {
                await pollFeed(client, guildId, config.news_channel_id, feed.id, feed.url, feed.label, feed.last_item_id);
            }
            catch (error) {
                logger.error({ err: error, feedId: feed.id, url: feed.url }, 'Error polling feed');
            }
        }
    }
}
async function pollFeed(client, guildId, channelId, feedId, feedUrl, feedLabel, lastItemId) {
    let rssFeed;
    try {
        rssFeed = await parser.parseURL(feedUrl);
    }
    catch (error) {
        logger.warn({ err: error, feedUrl }, 'Failed to parse feed');
        return;
    }
    if (!rssFeed.items || rssFeed.items.length === 0)
        return;
    // Find new items since last check
    const items = rssFeed.items;
    let newItems = [];
    if (!lastItemId) {
        // First poll - just post the most recent item and save the marker
        newItems = items.slice(0, 1);
    }
    else {
        // Find items newer than our last seen
        for (const item of items) {
            const itemId = item.guid || item.link || item.title || '';
            if (itemId === lastItemId)
                break;
            newItems.push(item);
        }
        // Cap at 5 to avoid flooding on first run or after long downtime
        newItems = newItems.slice(0, 5);
    }
    if (newItems.length === 0)
        return;
    // Post in chronological order (oldest first)
    newItems.reverse();
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        logger.error({ channelId }, 'News channel not found');
        return;
    }
    const textChannel = channel;
    for (const item of newItems) {
        // Check if this is a Twitter/X feed
        const isTwitterFeed = feedUrl.includes('twitter') ||
            feedUrl.includes('/x.com') ||
            (item.link && /twitter\.com|x\.com/i.test(item.link));
        if (isTwitterFeed && item.link) {
            await postTwitterItem(textChannel, item, rssFeed, feedLabel);
        }
        else {
            await postGenericItem(textChannel, item, rssFeed, feedLabel);
        }
    }
    // Update last seen item ID
    const latestItem = items[0];
    const latestId = latestItem.guid || latestItem.link || latestItem.title || '';
    if (latestId) {
        (0, queries_js_1.updateFeedLastItem)(feedId, latestId);
    }
    logger.info({ guildId, feedLabel, newCount: newItems.length }, 'Posted new feed items');
}
async function postTwitterItem(channel, item, rssFeed, feedLabel) {
    try {
        // Extract handle from tweet URL (twitter.com/handle/status/...)
        const handleMatch = item.link?.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status/i);
        const handle = handleMatch?.[1] || feedLabel.replace('@', '');
        // Get display name from item.creator or feed title
        const displayName = item.creator || rssFeed.title || handle;
        // Build the content line: "**handle** just posted a new Tweet!"
        const tweetUrl = item.link || '';
        const content = `**${handle}** just posted a new Tweet!\n${tweetUrl}`;
        // Build embed
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x000000); // Black like X/Twitter
        // Author line: "Display Name (@handle)"
        embed.setAuthor({ name: `${displayName} (@${handle})` });
        // Tweet text as description
        let desc = item.contentSnippet || item.content || item.summary || '';
        // Clean up HTML entities and extra whitespace
        desc = desc.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        desc = desc.replace(/\s+/g, ' ').trim();
        if (desc.length > 500)
            desc = desc.slice(0, 500) + '...';
        if (desc)
            embed.setDescription(desc);
        // Try to get profile picture from feed image
        const feedAny = rssFeed;
        const feedImage = rssFeed.image?.url || feedAny.itunes?.image;
        if (feedImage && typeof feedImage === 'string') {
            embed.setThumbnail(feedImage);
        }
        // Footer with X branding and timestamp
        const timestamp = item.pubDate ? new Date(item.pubDate) : new Date();
        const timeStr = timestamp.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
        embed.setFooter({ text: `X • ${timeStr}` });
        // Extract images from various sources
        const imageUrl = extractImageFromItem(item);
        if (imageUrl) {
            embed.setImage(imageUrl);
        }
        await channel.send({ content, embeds: [embed] });
    }
    catch (error) {
        logger.error({ err: error, feedLabel }, 'Failed to post Twitter item');
    }
}
async function postGenericItem(channel, item, rssFeed, feedLabel) {
    try {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x1DA1F2);
        if (item.title)
            embed.setTitle(item.title);
        if (item.link)
            embed.setURL(item.link);
        // Build description from content snippet
        let desc = item.contentSnippet || item.content || item.summary || '';
        if (desc.length > 500)
            desc = desc.slice(0, 500) + '...';
        if (desc)
            embed.setDescription(desc);
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
    }
    catch (error) {
        logger.error({ err: error, feedLabel }, 'Failed to post feed item');
    }
}
//# sourceMappingURL=feedWatcher.js.map