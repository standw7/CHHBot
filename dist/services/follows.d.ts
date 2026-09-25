import { Client } from 'discord.js';
import type { LandingGoal } from '../nhl/types.js';
export declare const MAX_FOLLOWS = 5;
export interface FollowablePlayer {
    id: number;
    firstName: string;
    lastName: string;
    sweaterNumber?: number;
}
export type MatchResult = {
    kind: 'match';
    player: FollowablePlayer;
} | {
    kind: 'ambiguous';
    players: FollowablePlayer[];
} | {
    kind: 'none';
};
/**
 * Match a query against players by jersey number (`9` / `#9`), exact full or last
 * name, then partial name. Case- and accent-insensitive; exact beats partial.
 */
export declare function matchRosterPlayer(query: string, players: FollowablePlayer[]): MatchResult;
/** Current roster of `teamCode` as followable players, or null if unavailable. */
export declare function loadFollowablePlayers(teamCode: string): Promise<FollowablePlayer[] | null>;
export interface FollowDmInput {
    goal: LandingGoal;
    followed: Set<number>;
    teamCode: string;
    homeAbbrev: string;
    awayAbbrev: string;
    periodNumber: number;
    periodType: string;
    cardUrl?: string;
}
/** DM text for one user and one goal, or null if they follow nobody on it (or it's a shootout goal). */
export declare function buildFollowDm(input: FollowDmInput): string | null;
/**
 * DM every follower of the scorer/assisters on this goal. Each user+goal is claimed
 * in the DB first, so the second guild's tracker posting the same goal doesn't re-send.
 * Users with DMs closed are logged and skipped.
 */
export declare function sendFollowDms(client: Client, gameId: number, input: Omit<FollowDmInput, 'followed'>): Promise<void>;
//# sourceMappingURL=follows.d.ts.map