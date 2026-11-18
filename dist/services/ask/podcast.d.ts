import type { Guild } from 'discord.js';
export declare const CLEAN_HITS: {
    name: string;
    youtube: string;
    substack: string;
    youtubeFeed: string;
    substackFeed: string;
    crewRoleName: string;
};
export interface FeedItem {
    title: string;
    url: string;
    published: string;
}
/** YouTube channel Atom feed → entries (newest first). */
export declare function parseYouTubeFeed(xml: string): FeedItem[];
/** RSS 2.0 feed (Substack) → items (newest first). */
export declare function parseRssFeed(xml: string): FeedItem[];
/** Newest Clean Hits YouTube video, or null if YouTube can't be reached. */
export declare function latestEpisode(): Promise<FeedItem | null>;
/** Newest Clean Hits Substack post, or null if unreachable. */
export declare function latestSubstackPost(): Promise<FeedItem | null>;
export declare function formatFeedDate(iso: string, zone?: string): string;
/** Title + date, with the URL on its own line so Discord embeds the video. */
export declare function formatEpisodeReply(item: FeedItem): string;
export declare function formatSubstackReply(item: FeedItem): string;
export declare const YOUTUBE_UNREACHABLE: string;
export declare const SUBSTACK_UNREACHABLE: string;
/**
 * The hosts are whoever holds the "Clean Hits Crew" role. Rendered as a role mention
 * (shows as a pill; doesn't ping because replies send allowedMentions.parse = []).
 * No GuildMembers intent, so members are never enumerated.
 */
export declare function crewRoleText(guild: Guild | null | undefined): string;
/** Values for {placeholders} in preset responses and LLM answers. */
export declare function templateVars(guild: Guild | null | undefined): Record<string, string>;
//# sourceMappingURL=podcast.d.ts.map