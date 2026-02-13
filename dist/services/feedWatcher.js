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
// Fetch tweet data from fxtwitter API
async function fetchTweetData(tweetUrl) {
    try {
        // Extract username and tweet ID from URL
        // Handles: twitter.com/user/status/123, x.com/user/status/123
        const match = tweetUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/i);
        if (!match)
            return null;
        const [, username, tweetId] = match;
        const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
        });
        if (!response.ok) {
            logger.warn({ tweetUrl, status: response.status }, 'fxtwitter API error');
            return null;
        }
        const data = await response.json();
        if (data.code !== 200 || !data.tweet) {
            logger.warn({ tweetUrl, code: data.code, message: data.message }, 'fxtwitter API returned error');
            return null;
        }
        return data.tweet;
    }
    catch (error) {
        logger.error({ err: error, tweetUrl }, 'Failed to fetch tweet data');
        return null;
    }
}
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
    if (!rssFeed.items || rssFeed.items.length === 0) {
        logger.info({ feedLabel, feedUrl }, 'Feed returned no items');
        return;
    }
    // Find new items since last check
    const items = rssFeed.items;
    let newItems = [];
    if (!lastItemId) {
        // First poll - just post the most recent item and save the marker
        logger.info({ feedLabel }, 'First poll for feed, posting most recent item');
        newItems = items.slice(0, 1);
    }
    else {
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
                if (!item.pubDate)
                    return false;
                const itemTime = new Date(item.pubDate).getTime();
                return itemTime > twoHoursAgo;
            });
            if (recentItems.length < newItems.length) {
                logger.info({ feedLabel, totalNew: newItems.length, recentNew: recentItems.length }, 'lastItemId not found in feed, filtering to recent items only');
                newItems = recentItems;
            }
        }
        // Cap at 3 to avoid flooding
        newItems = newItems.slice(0, 3);
    }
    if (newItems.length === 0) {
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
        const tweetUrl = item.link || '';
        // Try to fetch rich tweet data from fxtwitter API
        const tweetData = tweetUrl ? await fetchTweetData(tweetUrl) : null;
        if (tweetData) {
            // Check if this is a retweet (tweet author doesn't match feed account)
            const feedHandle = feedLabel.replace(/^@/, '').toLowerCase();
            const tweetAuthor = tweetData.author.screen_name.toLowerCase();
            const isRetweet = feedHandle !== tweetAuthor && feedHandle.length > 0;
            // We have rich tweet data - build a proper embed
            const embed = new discord_js_1.EmbedBuilder()
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
                let quoteText = `> **${q.author.name}** (@${q.author.screen_name})\n`;
                // Add each line of the quoted tweet with > prefix
                const quoteLines = q.text.split('\n').map(line => `> ${line}`).join('\n');
                quoteText += quoteLines;
                // Add link to quoted tweet
                quoteText += `\n> [View quoted tweet](${q.url})`;
                embed.addFields({
                    name: 'Quoting',
                    value: quoteText,
                    inline: false,
                });
                // If quoted tweet has media and main tweet doesn't, show quoted media
                if (!tweetData.media?.photos && !tweetData.media?.videos) {
                    if (q.media?.photos && q.media.photos.length > 0) {
                        embed.setImage(q.media.photos[0].url);
                    }
                    else if (q.media?.videos && q.media.videos.length > 0) {
                        embed.setImage(q.media.videos[0].thumbnail_url);
                    }
                }
            }
            // Add media if present - prefer photos, fall back to video thumbnail
            if (tweetData.media?.photos && tweetData.media.photos.length > 0) {
                embed.setImage(tweetData.media.photos[0].url);
            }
            else if (tweetData.media?.videos && tweetData.media.videos.length > 0) {
                embed.setImage(tweetData.media.videos[0].thumbnail_url);
            }
            // Format engagement numbers (1234 -> 1.2K)
            const formatCount = (n) => {
                if (n >= 1000000)
                    return `${(n / 1000000).toFixed(1)}M`;
                if (n >= 1000)
                    return `${(n / 1000).toFixed(1)}K`;
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
                                label: '🔗 View Original on 𝕏',
                                url: tweetUrl,
                            },
                        ],
                    },
                ],
            });
        }
        else {
            // Fallback: use RSS data if API fails
            const handleMatch = tweetUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status/i);
            const handle = handleMatch?.[1] || feedLabel.replace('@', '');
            const displayName = item.creator || rssFeed.title || handle;
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(0x000000)
                .setAuthor({ name: `${displayName} (@${handle})` })
                .setURL(tweetUrl);
            // Tweet text as description
            let desc = item.contentSnippet || item.content || item.summary || '';
            desc = desc.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            desc = desc.replace(/\s+/g, ' ').trim();
            if (desc.length > 500)
                desc = desc.slice(0, 500) + '...';
            if (desc)
                embed.setDescription(desc);
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
                                    label: '🔗 View Original on 𝕏',
                                    url: tweetUrl,
                                },
                            ],
                        },
                    ]
                    : [],
            });
        }
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