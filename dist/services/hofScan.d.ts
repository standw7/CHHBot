import { Guild, Message } from 'discord.js';
import type { GuildConfig } from '../db/models.js';
export declare const HOF_EMOJIS: string[];
export declare const DEFAULT_THRESHOLD = 8;
export interface ReactionCount {
    emojiName: string | null;
    count: number;
}
/**
 * True if any qualifying emoji's reaction count meets the threshold.
 * Pure — no network I/O — so it's unit tested directly.
 */
export declare function qualifiesForHof(reactionCounts: ReactionCount[], threshold: number, hofEmojis: string[]): boolean;
export interface ScanCandidate {
    message: Message;
    channelName: string;
    topCount: number;
}
/**
 * Scan every text channel the bot can read in the guild for messages posted on or after
 * `sinceISO` that meet the HoF threshold but were never inducted. Used by `!hof scan` to
 * backfill messages the reaction handler missed (e.g. while the bot was offline).
 */
export declare function scanForMissedHof(guild: Guild, config: GuildConfig, sinceISO: string): Promise<ScanCandidate[]>;
//# sourceMappingURL=hofScan.d.ts.map