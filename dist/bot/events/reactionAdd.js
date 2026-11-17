"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTomatoEmoji = exports.HOF_EMOJIS = void 0;
exports.buildHofPost = buildHofPost;
exports.sendBoardFollowups = sendBoardFollowups;
exports.inductMessage = inductMessage;
exports.refreshTomatoCounts = refreshTomatoCounts;
exports.registerReactionHandler = registerReactionHandler;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
const hofScan_js_1 = require("../../services/hofScan.js");
Object.defineProperty(exports, "HOF_EMOJIS", { enumerable: true, get: function () { return hofScan_js_1.HOF_EMOJIS; } });
const follows_js_1 = require("../../services/follows.js");
const hofLinks_js_1 = require("../../services/hofLinks.js");
Object.defineProperty(exports, "isTomatoEmoji", { enumerable: true, get: function () { return hofLinks_js_1.isTomatoEmoji; } });
const socialCaption_js_1 = require("../../services/socialCaption.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'hall-of-fame' });
// Nothing the bot posts on the boards should ever ping anyone
const NO_PINGS = { parse: [] };
function displayName(message) {
    return message.member?.displayName ?? message.author?.displayName ?? message.author?.username ?? 'Unknown';
}
/** Adapt a discord.js message (plus forwarded snapshot) to the pure summarizer's input. */
function toSummaryInput(message, attachments) {
    const snapshot = message.messageSnapshots?.first();
    const embeds = [...message.embeds, ...(snapshot?.embeds ?? [])].map(e => ({
        title: e.title,
        description: e.description,
        authorName: e.author?.name,
    }));
    return {
        content: message.content,
        snapshotContent: snapshot?.content,
        embeds,
        attachments: attachments ?? [
            ...message.attachments.values(),
            ...(snapshot ? snapshot.attachments.values() : []),
        ],
        stickerNames: [...message.stickers.values(), ...(snapshot ? snapshot.stickers.values() : [])].map(s => s.name),
    };
}
/**
 * Build a full HOF post from a Discord message.
 * Returns the embed, the message's links (and the replied-to message's links) to send as
 * follow-ups, and video attachments. Exported so the rebuild command can reuse it.
 */
async function buildHofPost(message, guildId, channelId, messageId) {
    const author = message.author;
    // For forwarded messages, content and attachments live in messageSnapshots
    const snapshot = message.messageSnapshots?.first();
    const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
    // Merge attachments from message and snapshot (forwarded messages store them in snapshot)
    const msgAttachments = Array.from(message.attachments.values());
    const snapshotAttachments = snapshot ? Array.from(snapshot.attachments.values()) : [];
    const attachments = msgAttachments.length > 0 ? msgAttachments : snapshotAttachments;
    // Text, else forwarded text, else embed text, else "what's attached"
    const description = (0, hofLinks_js_1.summarizeMessage)(toSummaryInput(message, attachments), 1500);
    const embed = new discord_js_1.EmbedBuilder()
        .setAuthor({
        name: author?.displayName ?? author?.username ?? 'Unknown',
        iconURL: author?.displayAvatarURL(),
    })
        .setDescription(description)
        .setColor(0xFF4500)
        .setTimestamp(message.createdAt);
    const embedLinks = (0, hofLinks_js_1.extractPostLinks)([message.content, snapshot?.content]);
    // --- Reply context ---
    let replyLinks = [];
    let replyAuthorName = null;
    if (message.reference) {
        try {
            const repliedTo = await message.fetchReference();
            replyAuthorName = repliedTo.author?.displayName ?? repliedTo.author?.username ?? 'Unknown';
            embed.addFields({
                name: `↩ Reply to ${replyAuthorName}`,
                value: (0, hofLinks_js_1.summarizeMessage)(toSummaryInput(repliedTo), 300),
                inline: false,
            });
            const replySnapshot = repliedTo.messageSnapshots?.first();
            replyLinks = (0, hofLinks_js_1.extractPostLinks)([repliedTo.content, replySnapshot?.content])
                .filter(url => !embedLinks.includes(url));
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
    // Embed first image (check attachments first, then snapshot embeds for image URLs)
    if (imageAttachment) {
        embed.setImage(imageAttachment.url);
    }
    else if (snapshot) {
        // Forwarded messages may have images in their embeds rather than attachments
        const snapshotImageUrl = snapshot.embeds?.find(e => e.image?.url)?.image?.url
            ?? snapshot.embeds?.find(e => e.thumbnail?.url)?.thumbnail?.url;
        if (snapshotImageUrl) {
            embed.setImage(snapshotImageUrl);
        }
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
    return { embed, embedLinks, files, authorName: displayName(message), replyLinks, replyAuthorName };
}
/**
 * Send the follow-up messages that sit under a HoF / Tomato Town card:
 *   - the inducted message's own links (+ Instagram captions) and video files. When a reply
 *     follow-up is coming too, it is labelled `-# 🔥 <author>'s post` to tell them apart.
 *   - if the replied-to message had links: `-# ↩ Replying to <author>` + those links.
 * Shared by HoF inductions, the HoF rebuild command, and Tomato Town.
 */
async function sendBoardFollowups(tc, post, emoji) {
    const ids = { followupId: null, replyFollowupId: null };
    const allLinks = [...post.embedLinks, ...post.replyLinks];
    if (allLinks.length === 0 && post.files.length === 0)
        return ids;
    // Instagram's embed hides its caption, so fetch it ourselves (in parallel, never throws)
    const captions = new Map();
    await Promise.all(allLinks.filter(socialCaption_js_1.isInstagramLink).map(async (url) => {
        captions.set(url, await (0, socialCaption_js_1.fetchInstagramCaption)(url));
    }));
    const withCaptions = (urls) => urls.map(url => ({ url, caption: captions.get(url) ?? null }));
    if (post.embedLinks.length > 0 || post.files.length > 0) {
        const label = post.replyLinks.length > 0 ? `-# ${emoji} ${(0, discord_js_1.escapeMarkdown)(post.authorName)}'s post` : null;
        const content = post.embedLinks.length > 0 || label ? (0, hofLinks_js_1.buildFollowupContent)(label, withCaptions(post.embedLinks)) : '';
        const followup = await tc.send({ content: content || undefined, files: post.files, allowedMentions: NO_PINGS });
        ids.followupId = followup.id;
    }
    if (post.replyLinks.length > 0) {
        try {
            const label = `-# ↩ Replying to ${(0, discord_js_1.escapeMarkdown)(post.replyAuthorName ?? 'Unknown')}`;
            const replyFollowup = await tc.send({
                content: (0, hofLinks_js_1.buildFollowupContent)(label, withCaptions(post.replyLinks)),
                allowedMentions: NO_PINGS,
            });
            ids.replyFollowupId = replyFollowup.id;
        }
        catch (error) {
            logger.warn({ error }, 'Failed to send reply-links follow-up');
        }
    }
    return ids;
}
/**
 * Build a HoF post for the given message and post it to the guild's HoF channel,
 * marking it inducted (and recording any follow-up messages) in the DB.
 * Returns true when it posted, false if the HoF channel could not be resolved.
 * Shared by the reaction handler and the `!hof scan` backfill command.
 */
async function inductMessage(message, guildId, config, options = {}) {
    const channelId = message.channel.id;
    const messageId = message.id;
    // Build the HoF post
    const post = await buildHofPost(message, guildId, channelId, messageId);
    // Post to HoF channel
    const hofChannel = await message.guild.channels.fetch(config.hof_channel_id);
    if (!hofChannel || !hofChannel.isTextBased()) {
        logger.error({ hofChannelId: config.hof_channel_id }, 'Hall of Fame channel not found or not text-based');
        return false;
    }
    const tc = hofChannel;
    // Send the main HOF embed (no files — videos go in follow-up so they render below)
    const hofMessage = await tc.send({ embeds: [post.embed], allowedMentions: NO_PINGS });
    (0, queries_js_1.markMessageInducted)(guildId, messageId, channelId, hofMessage.id, config.hof_channel_id);
    // Follow-ups with links and/or video files (render below the card)
    const { followupId, replyFollowupId } = await sendBoardFollowups(tc, post, '🔥');
    if (followupId || replyFollowupId)
        (0, queries_js_1.updateHofFollowup)(guildId, messageId, followupId, replyFollowupId);
    // Live inductions only — `!hof scan` backfills don't DM
    if (options.notifyFollowers) {
        const authorName = message.member?.displayName ?? message.author.displayName;
        await (0, follows_js_1.sendHofFollowDms)(message.client, guildId, message.guild.name, message.author.id, authorName, hofMessage.url);
    }
    return true;
}
// ---- Tomato Town: like the HoF, but for 🍅 ----
const TOMATO_BOARD = 'tomato';
const TOMATO_COLOR = 0xE5322D;
const TOMATO_EDIT_DEBOUNCE_MS = 2000;
function tomatoTotal(message) {
    return (0, hofLinks_js_1.sumTomatoCount)([...message.reactions.cache.values()].map(r => ({ emojiName: r.emoji.name, count: r.count })));
}
// Last count written to each board post (by original message id), so repeat edits are skipped
const lastTomatoCount = new Map();
// Pending debounced count edits: a burst of 🍅 becomes one edit
const pendingTomatoEdits = new Map();
/** Edit an existing Tomato Town post's header to the message's current tomato total (debounced). */
function scheduleTomatoCountUpdate(message, guild, boardChannelId) {
    const messageId = message.id;
    const existing = pendingTomatoEdits.get(messageId);
    if (existing)
        clearTimeout(existing);
    pendingTomatoEdits.set(messageId, setTimeout(() => {
        pendingTomatoEdits.delete(messageId);
        void (async () => {
            try {
                const boardMessageId = (0, queries_js_1.getBoardMessageId)(TOMATO_BOARD, guild.id, messageId);
                if (!boardMessageId)
                    return;
                // A partial (uncached) message has no reaction counts; fetch it to get them
                const fresh = message.partial ? await message.fetch() : message;
                const count = tomatoTotal(fresh);
                if (lastTomatoCount.get(messageId) === count)
                    return;
                const board = await guild.channels.fetch(boardChannelId);
                if (!board?.isTextBased())
                    return;
                await board.messages.edit(boardMessageId, { content: (0, hofLinks_js_1.tomatoHeader)(count), allowedMentions: NO_PINGS });
                lastTomatoCount.set(messageId, count);
            }
            catch (error) {
                logger.warn({ error, messageId }, 'Failed to update Tomato Town count');
            }
        })();
    }, TOMATO_EDIT_DEBOUNCE_MS));
}
async function handleTomatoReaction(reaction, config, kind) {
    const guild = reaction.message.guild;
    const messageId = reaction.message.id;
    const channelId = reaction.message.channel.id;
    const boardChannelId = config.tomato_channel_id;
    // Never repost the boards' own posts
    if (channelId === boardChannelId || channelId === config.hof_channel_id)
        return;
    // Already on the board: keep its count live
    if ((0, queries_js_1.getBoardMessageId)(TOMATO_BOARD, guild.id, messageId)) {
        const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
        scheduleTomatoCountUpdate(message, guild, boardChannelId);
        return;
    }
    if (kind === 'remove')
        return;
    if ((reaction.count ?? 0) < (config.tomato_threshold ?? hofScan_js_1.DEFAULT_THRESHOLD))
        return;
    if ((0, queries_js_1.hasBoardPost)(TOMATO_BOARD, guild.id, messageId))
        return;
    // Claim first: several 🍅 can land at once, and each fires this handler
    if (!(0, queries_js_1.claimBoardPost)(TOMATO_BOARD, guild.id, messageId, channelId))
        return;
    try {
        const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
        const board = await guild.channels.fetch(boardChannelId);
        if (!board?.isTextBased()) {
            logger.error({ boardChannelId }, 'Tomato Town channel not found or not text-based');
            (0, queries_js_1.releaseBoardPost)(TOMATO_BOARD, guild.id, messageId);
            return;
        }
        const post = await buildHofPost(message, guild.id, channelId, messageId);
        post.embed.setColor(TOMATO_COLOR);
        const tc = board;
        const count = tomatoTotal(message);
        const boardPost = await tc.send({ content: (0, hofLinks_js_1.tomatoHeader)(count), embeds: [post.embed], allowedMentions: NO_PINGS });
        (0, queries_js_1.setBoardMessageId)(TOMATO_BOARD, guild.id, messageId, boardPost.id);
        lastTomatoCount.set(messageId, count);
        await sendBoardFollowups(tc, post, '🍅');
        logger.info({ guildId: guild.id, messageId, channelId, reactionCount: count }, 'Message sent to Tomato Town');
        // 🍅 that landed while we were posting were skipped by the board-post check above; catch up
        scheduleTomatoCountUpdate(message, guild, boardChannelId);
    }
    catch (error) {
        // let the next 🍅 retry — unless the board post went out, in which case keep it
        if (!(0, queries_js_1.getBoardMessageId)(TOMATO_BOARD, guild.id, messageId))
            (0, queries_js_1.releaseBoardPost)(TOMATO_BOARD, guild.id, messageId);
        throw error;
    }
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * One-time startup pass: bring every Tomato Town post's `🍅 **N**` header up to date
 * (posts made before counts went live all froze at the threshold). Sequential and throttled;
 * deleted posts/messages/channels are skipped. Only posts whose count differs are edited.
 */
async function refreshTomatoCounts(client) {
    let edited = 0;
    let checked = 0;
    for (const guild of client.guilds.cache.values()) {
        const config = (0, queries_js_1.getGuildConfig)(guild.id);
        if (!config?.tomato_channel_id)
            continue;
        let board;
        try {
            const ch = await guild.channels.fetch(config.tomato_channel_id);
            if (!ch?.isTextBased())
                continue;
            board = ch;
        }
        catch {
            continue;
        }
        for (const row of (0, queries_js_1.getBoardPosts)(TOMATO_BOARD, guild.id)) {
            if (!row.original_channel_id)
                continue;
            try {
                checked++;
                const boardMsg = await board.messages.fetch(row.board_message_id);
                const current = (0, hofLinks_js_1.parseTomatoHeader)(boardMsg.content);
                const origChannel = await guild.channels.fetch(row.original_channel_id);
                if (!origChannel?.isTextBased())
                    continue;
                const orig = await origChannel.messages.fetch(row.original_message_id);
                const count = tomatoTotal(orig);
                lastTomatoCount.set(row.original_message_id, count);
                if (current !== count) {
                    await boardMsg.edit({ content: (0, hofLinks_js_1.tomatoHeader)(count), allowedMentions: NO_PINGS });
                    edited++;
                }
            }
            catch {
                // board post, original message, or channel deleted — nothing to update
            }
            await sleep(1000);
        }
    }
    if (checked > 0)
        logger.info({ checked, edited }, 'Refreshed Tomato Town counts');
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
            const emojiName = reaction.emoji.name;
            if ((0, hofLinks_js_1.isTomatoEmoji)(emojiName)) {
                const config = (0, queries_js_1.getGuildConfig)(reaction.message.guild.id);
                if (config?.tomato_channel_id)
                    await handleTomatoReaction(reaction, config, 'add');
                return;
            }
            // Check if this is a qualifying emoji
            if (!emojiName || !hofScan_js_1.HOF_EMOJIS.includes(emojiName))
                return;
            const guildId = reaction.message.guild.id;
            const config = (0, queries_js_1.getGuildConfig)(guildId);
            if (!config?.hof_channel_id)
                return;
            const messageId = reaction.message.id;
            const channelId = reaction.message.channel.id;
            // Don't induct the boards' own reposts (HoF or Tomato Town)
            if (channelId === config.hof_channel_id || channelId === config.tomato_channel_id)
                return;
            const threshold = config.hof_threshold ?? hofScan_js_1.DEFAULT_THRESHOLD;
            const count = reaction.count ?? 0;
            // Check if already inducted - skip if so (no duplicates)
            if ((0, queries_js_1.hasMessageBeenInducted)(guildId, messageId))
                return;
            // Need to meet threshold for initial induction
            if (count < threshold)
                return;
            // Fetch the full message
            const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
            const posted = await inductMessage(message, guildId, config, { notifyFollowers: true });
            if (posted) {
                logger.info({ guildId, messageId, channelId, emoji: emojiName, reactionCount: count }, 'Message inducted to Hall of Fame');
            }
        }
        catch (error) {
            logger.error({ error }, 'Error in hall of fame reaction handler');
        }
    });
    // Only Tomato Town cares about removals (its post shows a live 🍅 count).
    // Don't fetch the partial reaction here: if the last 🍅 was removed it no longer exists.
    client.on('messageReactionRemove', async (reaction) => {
        try {
            if (!(0, hofLinks_js_1.isTomatoEmoji)(reaction.emoji.name))
                return;
            const guild = reaction.message.guild;
            if (!guild)
                return;
            const config = (0, queries_js_1.getGuildConfig)(guild.id);
            if (config?.tomato_channel_id)
                await handleTomatoReaction(reaction, config, 'remove');
        }
        catch (error) {
            logger.error({ error }, 'Error in Tomato Town reaction-remove handler');
        }
    });
}
//# sourceMappingURL=reactionAdd.js.map