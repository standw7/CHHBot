import type { ShiftChartRow, BoxscoreTeamPlayers } from '../nhl/types.js';
import type { ToiChartInput } from './toiRender.js';
/** One side of a boxscore: abbreviation + its players. */
export interface BoxTeam extends BoxscoreTeamPlayers {
    abbrev: string;
}
/**
 * Chart input for `teamCode` (rows) vs its opponent (columns), or null if the team isn't
 * in this game, or 'incomplete' while shift data doesn't yet match the boxscore.
 */
export declare function toiChartInputFromGame(rows: ShiftChartRow[], home: BoxTeam, away: BoxTeam, teamCode: string): ToiChartInput | 'incomplete' | null;
//# sourceMappingURL=toiPost.d.ts.map