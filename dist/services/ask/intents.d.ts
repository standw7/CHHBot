import type { PlayerSeasonStats } from '../../nhl/types.js';
export type StatKey = 'goals' | 'assists' | 'points' | 'shots' | 'pim' | 'plusMinus' | 'powerPlayGoals' | 'gamesPlayed' | 'wins' | 'shutouts';
export type AskIntent = {
    kind: 'next_game';
} | {
    kind: 'standings';
    filter?: 'league' | 'east' | 'west';
} | {
    kind: 'last_game';
} | {
    kind: 'player_stats';
    player: string;
    stat?: StatKey;
} | {
    kind: 'latest_episode';
} | {
    kind: 'latest_substack';
};
/** Strip greeting/filler words at either end ("hey tusky when is the next game please"). */
export declare function coreQuestion(normalized: string): string;
/** Map a normalized message to a live-data intent, or null when it isn't a clean match. */
export declare function parseIntent(normalized: string): AskIntent | null;
/** Name variants to try against the roster ("cooleys" from "cooley's stats" → also "cooley"). */
export declare function playerNameCandidates(name: string): string[];
/**
 * One dry line answering "how many X does Y have", from the season stats the !player embed uses.
 * Null when the stat doesn't apply to the position or isn't available.
 */
export declare function formatStatAnswer(name: string, position: string, season: PlayerSeasonStats | undefined, stat: StatKey, seasonLabel: string): string | null;
//# sourceMappingURL=intents.d.ts.map