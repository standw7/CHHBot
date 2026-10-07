import type { LandingGoal, PlayerSeasonStats } from '../nhl/types.js';
export type LeaderCategory = 'goals' | 'assists' | 'points' | 'goalsPp' | 'goalsSh';
export declare const LEADER_CATEGORIES: LeaderCategory[];
export interface LeaderRow {
    id: number;
    name: string;
    team: string;
    value: number;
}
export type LeaderSnapshot = Record<LeaderCategory, LeaderRow[]>;
export interface LeaderAlert {
    title: string;
    lines: string[];
}
/**
 * Whether going from `before` to `after` moves the player into the NHL top 3 or into 1st
 * (alone or tied) in a category, given everyone else's current values. Ranks share ties:
 * rank = 1 + number of players strictly ahead. Returns the alert with the top 3, or null.
 */
export declare function evaluateLeaderMove(category: LeaderCategory, player: {
    id: number;
    name: string;
    team: string;
}, before: number, after: number, board: LeaderRow[]): LeaderAlert | null;
/** A player's in-game totals from the goals so far (shootout goals excluded). */
export declare function inGameTotals(playerId: number, goalsSoFar: LandingGoal[]): Record<LeaderCategory, number>;
/** Categories a goal can change for its scorer or an assister. */
export declare function categoriesForGoal(goal: LandingGoal, role: 'scorer' | 'assister'): LeaderCategory[];
/** League top-100 per category, or null if unavailable. Taken when a game goes LIVE. */
export declare function loadLeaderSnapshot(): Promise<LeaderSnapshot | null>;
/** A player's pre-game season totals per category from his landing featured stats. */
export declare function seasonTotalsFrom(stats: PlayerSeasonStats | undefined): Record<LeaderCategory, number>;
/**
 * NHL top-3 alerts for one goal: the scorer and each assister, in the categories this
 * goal changes. Team players on the board get their in-game totals added; everyone
 * else uses the pre-game snapshot.
 */
export declare function leaderAlertsForGoal(input: {
    goal: LandingGoal;
    goalsSoFar: LandingGoal[];
    teamCode: string;
    snapshot: LeaderSnapshot;
    seasonBefore: Map<number, Record<LeaderCategory, number>>;
}): LeaderAlert[];
//# sourceMappingURL=leaders.d.ts.map