export declare const SOCIAL_LINK_PATTERNS: {
    re: RegExp;
    toEmbedUrl: (match: RegExpExecArray) => string;
}[];
export declare const MAX_POST_LINKS = 5;
/** Rewrite a single URL to its embed-fix domain if it's a social link; otherwise return it unchanged. */
export declare function rewriteSocialLink(url: string): string;
/**
 * Every http(s) link in the given texts, social ones rewritten to their embed-fix domain,
 * deduped, in order. Skips Discord message links (they don't unfurl usefully) and links the
 * author wrapped in <…> to suppress their embed. Capped at `max`.
 */
export declare function extractPostLinks(texts: (string | null | undefined)[], max?: number): string[];
export interface SummaryEmbed {
    title?: string | null;
    description?: string | null;
    authorName?: string | null;
}
export interface SummaryAttachment {
    contentType?: string | null;
}
export interface MessageSummaryInput {
    content?: string | null;
    snapshotContent?: string | null;
    embeds?: SummaryEmbed[];
    attachments?: SummaryAttachment[];
    stickerNames?: string[];
}
export declare const NO_TEXT_FALLBACK = "*No text content*";
export declare function truncateText(s: string, max: number): string;
/** Describe attachments when there's no text, e.g. "🖼 Image attached". Null if none. */
export declare function describeAttachments(attachments: SummaryAttachment[]): string | null;
/**
 * Best text representation of a message: its content → forwarded snapshot content →
 * first useful embed (title/description/author) → attachment description → sticker name →
 * fallback. Truncated to `max`.
 */
export declare function summarizeMessage(input: MessageSummaryInput, max: number): string;
export interface FollowupLink {
    url: string;
    caption?: string | null;
}
/**
 * Build a follow-up message body: optional `-#` label line, then each link followed by its
 * caption block. Kept under Discord's 2000-char limit by dropping captions from the end,
 * then links. Returns '' when there's nothing to say.
 */
export declare function buildFollowupContent(label: string | null, links: FollowupLink[]): string;
/** Sum of all tomato-emoji reactions (🍅 or custom emoji named like "tomato"). */
export declare function isTomatoEmoji(name: string | null | undefined): boolean;
export declare function sumTomatoCount(reactions: {
    emojiName: string | null | undefined;
    count: number | null | undefined;
}[]): number;
/** "🍅 **N**" header for Tomato Town posts, and its inverse. */
export declare function tomatoHeader(count: number): string;
export declare function parseTomatoHeader(content: string | null | undefined): number | null;
//# sourceMappingURL=hofLinks.d.ts.map