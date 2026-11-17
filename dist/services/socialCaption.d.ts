export declare const CAPTION_MAX = 300;
export interface SocialCaption {
    title: string | null;
    caption: string | null;
}
/** Decode the HTML entities that show up in OG meta content (numeric + a few named). */
export declare function decodeHtmlEntities(s: string): string;
/** Pull og:title / og:description out of an HTML page. Null when neither has text. */
export declare function parseSocialCaption(html: string): SocialCaption | null;
/**
 * Format as Discord markdown to sit under the link:
 *   -# Name (@handle)
 *   > caption line 1
 *   > caption line 2
 * Returns null if there's nothing worth posting.
 */
export declare function formatSocialCaption(c: SocialCaption, max?: number): string | null;
/** True for a (rewritten) Instagram post/reel link we should fetch a caption for. */
export declare function isInstagramLink(url: string): boolean;
/**
 * Fetch the formatted caption block for an Instagram link via vxinstagram.
 * Never throws; returns null on any failure (timeout, non-200, no OG tags).
 */
export declare function fetchInstagramCaption(url: string): Promise<string | null>;
//# sourceMappingURL=socialCaption.d.ts.map