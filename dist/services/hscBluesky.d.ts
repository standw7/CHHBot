import { Client, EmbedBuilder } from 'discord.js';
export interface ImpactCardPost {
    uri: string;
    rkey: string;
    text: string;
    imageUrl: string;
    createdAt: string;
}
export declare function isTeamImpactCard(text: string, teamName: string): boolean;
/** HSC's own (not reposted, not reply) image posts of the team's Game Score Impact Card, feed order. */
export declare function parseImpactCards(feed: unknown, teamName: string): ImpactCardPost[];
export declare function buildImpactCardEmbed(post: ImpactCardPost): EmbedBuilder;
/**
 * What one poll should do: post each unseen card to the guilds of its team (oldest first),
 * and mark every post in the feed seen, so cards from before a guild was enabled never backfill.
 */
export declare function planHscPoll(feed: unknown, guildsByTeamName: Map<string, string[]>, isSeen: (uri: string) => boolean): {
    post: {
        card: ImpactCardPost;
        guildIds: string[];
    }[];
    markSeen: string[];
};
export declare function latestImpactCard(teamName: string): Promise<ImpactCardPost | null>;
export declare function startHscWatcher(client: Client): void;
export declare function stopHscWatcher(): void;
//# sourceMappingURL=hscBluesky.d.ts.map