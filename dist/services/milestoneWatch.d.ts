export interface WatchPlayer {
    name: string;
    careerGamesPlayed: number;
    careerGoals: number;
    careerPoints: number;
    seasonGoals: number;
}
/**
 * Milestones a player could reach tonight: 1 goal from a season/career goal mark,
 * within 2 points of a career point mark, a hundredth game, or an NHL debut.
 * Uses the same thresholds as the goal-card milestones.
 */
export declare function findUpcomingMilestones(players: WatchPlayer[]): string[];
/**
 * Loads the current roster's regular-season stats. `season` is the game's season id
 * (e.g. 20262027); until a player's featured season matches it, his season goals are 0
 * (before his first game the NHL still reports last season). Players whose profile
 * fails to load are skipped rather than treated as zeros (which would read as a debut).
 * Returns null if the roster itself can't be loaded.
 */
export declare function loadWatchPlayers(teamCode: string, season: number): Promise<WatchPlayer[] | null>;
//# sourceMappingURL=milestoneWatch.d.ts.map