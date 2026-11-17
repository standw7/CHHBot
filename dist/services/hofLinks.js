"use strict";
// Pure helpers for Hall of Fame / Tomato Town posts: link extraction + rewrite,
// message summaries, and follow-up message formatting. No discord.js runtime use,
// so everything here is unit tested directly.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_TEXT_FALLBACK = exports.MAX_POST_LINKS = exports.SOCIAL_LINK_PATTERNS = void 0;
exports.rewriteSocialLink = rewriteSocialLink;
exports.extractPostLinks = extractPostLinks;
exports.truncateText = truncateText;
exports.describeAttachments = describeAttachments;
exports.summarizeMessage = summarizeMessage;
exports.buildFollowupContent = buildFollowupContent;
exports.isTomatoEmoji = isTomatoEmoji;
exports.sumTomatoCount = sumTomatoCount;
exports.tomatoHeader = tomatoHeader;
exports.parseTomatoHeader = parseTomatoHeader;
// Social link patterns: match all variants (original + embed-fix domains), normalize to embed-fix URL
exports.SOCIAL_LINK_PATTERNS = [
    {
        // Twitter/X (all variants) — group 3 = user/status/id path
        re: /https?:\/\/(www\.)?(x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|xcancel\.com|fixupx\.com|twittpr\.com)\/([\w/]+\/status\/\d+\S*)/gi,
        toEmbedUrl: (m) => `https://fxtwitter.com/${m[3]}`,
    },
    {
        // Instagram (all variants) — group 3 = p|reel|reels, group 4 = post id
        re: /https?:\/\/(www\.)?(instagram\.com|ddinstagram\.com|vxinstagram\.com)\/(p|reel|reels)\/([\w-]+\S*)/gi,
        toEmbedUrl: (m) => `https://vxinstagram.com/${m[3]}/${m[4]}`,
    },
    {
        // TikTok (all variants) — group 3 = path after domain
        re: /https?:\/\/(www\.|vm\.)?(tiktok\.com|vxtiktok\.com|tiktxk\.com|tnktok\.com)\/(\S+)/gi,
        toEmbedUrl: (m) => `https://${m[1] === 'vm.' ? 'vm.' : ''}tnktok.com/${m[3]}`,
    },
];
exports.MAX_POST_LINKS = 5;
const DISCORD_MESSAGE_LIMIT = 2000;
/** Rewrite a single URL to its embed-fix domain if it's a social link; otherwise return it unchanged. */
function rewriteSocialLink(url) {
    for (const { re, toEmbedUrl } of exports.SOCIAL_LINK_PATTERNS) {
        const single = new RegExp(re.source, 'i');
        const m = single.exec(url);
        if (m && m.index === 0)
            return toEmbedUrl(m);
    }
    return url;
}
/** Strip trailing punctuation/markdown that the URL regex swallowed (keeps balanced parens). */
function trimUrl(raw) {
    let url = raw;
    for (;;) {
        const last = url[url.length - 1];
        if (last === ')') {
            const opens = (url.match(/\(/g) ?? []).length;
            const closes = (url.match(/\)/g) ?? []).length;
            if (closes > opens) {
                url = url.slice(0, -1);
                continue;
            }
            break;
        }
        if (last && '.,;:!?\'"]}>|*_~'.includes(last)) {
            url = url.slice(0, -1);
            continue;
        }
        break;
    }
    return url;
}
/**
 * Every http(s) link in the given texts, social ones rewritten to their embed-fix domain,
 * deduped, in order. Skips Discord message links (they don't unfurl usefully) and links the
 * author wrapped in <…> to suppress their embed. Capped at `max`.
 */
function extractPostLinks(texts, max = exports.MAX_POST_LINKS) {
    const out = [];
    const seen = new Set();
    for (const text of texts) {
        if (!text)
            continue;
        const re = /https?:\/\/[^\s<>]+/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            if (text[m.index - 1] === '<' && text[m.index + m[0].length] === '>')
                continue; // <suppressed>
            const url = trimUrl(m[0]);
            if (!/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(url))
                continue;
            if (/^https?:\/\/((www|ptb|canary)\.)?discord(app)?\.com\/channels\//i.test(url))
                continue;
            const fixed = rewriteSocialLink(url);
            if (seen.has(fixed))
                continue;
            seen.add(fixed);
            out.push(fixed);
            if (out.length >= max)
                return out;
        }
    }
    return out;
}
exports.NO_TEXT_FALLBACK = '*No text content*';
function truncateText(s, max) {
    return s.length > max ? s.slice(0, max) + '... (truncated)' : s;
}
/** Describe attachments when there's no text, e.g. "🖼 Image attached". Null if none. */
function describeAttachments(attachments) {
    if (attachments.length === 0)
        return null;
    const hasVideo = attachments.some(a => a.contentType?.startsWith('video/'));
    const hasImage = attachments.some(a => a.contentType?.startsWith('image/'));
    if (hasVideo && hasImage)
        return '📎 Media attached';
    if (hasVideo)
        return '🎬 Video attached';
    if (hasImage)
        return '🖼 Image attached';
    return '📎 Attachment';
}
function summarizeEmbed(e) {
    const title = e.title?.trim();
    const desc = e.description?.trim();
    if (title && desc)
        return `**${title}**\n${desc}`;
    if (desc)
        return desc;
    if (title)
        return `**${title}**`;
    const author = e.authorName?.trim();
    return author || null;
}
/**
 * Best text representation of a message: its content → forwarded snapshot content →
 * first useful embed (title/description/author) → attachment description → sticker name →
 * fallback. Truncated to `max`.
 */
function summarizeMessage(input, max) {
    const pick = () => {
        const content = input.content?.trim();
        if (content)
            return content;
        const snap = input.snapshotContent?.trim();
        if (snap)
            return snap;
        for (const e of input.embeds ?? []) {
            const s = summarizeEmbed(e);
            if (s)
                return s;
        }
        const att = describeAttachments(input.attachments ?? []);
        if (att)
            return att;
        const sticker = input.stickerNames?.find(n => n.trim());
        if (sticker)
            return `🏷 Sticker: ${sticker.trim()}`;
        return exports.NO_TEXT_FALLBACK;
    };
    return truncateText(pick(), max);
}
/**
 * Build a follow-up message body: optional `-#` label line, then each link followed by its
 * caption block. Kept under Discord's 2000-char limit by dropping captions from the end,
 * then links. Returns '' when there's nothing to say.
 */
function buildFollowupContent(label, links) {
    const render = (items, withCaptions) => {
        const parts = [];
        if (label)
            parts.push(label);
        items.forEach((l, i) => {
            parts.push(l.url);
            if (withCaptions[i] && l.caption)
                parts.push(l.caption);
        });
        return parts.join('\n');
    };
    let items = [...links];
    const withCaptions = items.map(l => !!l.caption);
    let text = render(items, withCaptions);
    for (let i = withCaptions.length - 1; text.length > DISCORD_MESSAGE_LIMIT && i >= 0; i--) {
        if (!withCaptions[i])
            continue;
        withCaptions[i] = false;
        text = render(items, withCaptions);
    }
    while (text.length > DISCORD_MESSAGE_LIMIT && items.length > 0) {
        items = items.slice(0, -1);
        withCaptions.pop();
        text = render(items, withCaptions);
    }
    if (items.length === 0 && !label)
        return '';
    return text;
}
/** Sum of all tomato-emoji reactions (🍅 or custom emoji named like "tomato"). */
function isTomatoEmoji(name) {
    return name === '🍅' || (!!name && name.toLowerCase().includes('tomato'));
}
function sumTomatoCount(reactions) {
    return reactions.reduce((n, r) => n + (isTomatoEmoji(r.emojiName) ? (r.count ?? 0) : 0), 0);
}
/** "🍅 **N**" header for Tomato Town posts, and its inverse. */
function tomatoHeader(count) {
    return `🍅 **${count}**`;
}
function parseTomatoHeader(content) {
    const m = /🍅 \*\*(\d+)\*\*/.exec(content ?? '');
    return m ? parseInt(m[1], 10) : null;
}
//# sourceMappingURL=hofLinks.js.map