import type { ShiftChartRow } from '../nhl/types.js';
/** One shift in absolute game seconds; on ice for start <= t < end. */
export interface Shift {
    playerId: number;
    team: string;
    start: number;
    end: number;
}
/** 5v5 seconds. against: `${teamId}-${opponentId}`; together: `${minId}-${maxId}` same-team pairs (both teams); toi: per skater. */
export interface FiveOnFive {
    against: Map<string, number>;
    together: Map<string, number>;
    toi: Map<number, number>;
}
export declare function normalizeShifts(rows: ShiftChartRow[]): Shift[];
/** Right after the final the NHL may publish shifts that haven't closed yet. */
export declare function hasOpenShifts(rows: ShiftChartRow[]): boolean;
/** Complete when nothing is open and every boxscore skater's shifts sum to his TOI (± tolerance). */
export declare function isShiftDataComplete(shifts: Shift[], boxscoreToiSec: Map<number, number>, hadOpenShifts: boolean, toleranceSec?: number): boolean;
/** Per-second walk: a second counts when each team has exactly 5 skaters + 1 goalie on the ice. */
export declare function computeFiveOnFive(shifts: Shift[], goalieIds: Set<number>, team: string, opponent: string): FiveOnFive;
export interface ChartPlayer {
    id: number;
    label: string;
    position: 'F' | 'D';
}
export declare function chartLabel(firstName: string, lastName: string): string;
/** Chart order: forwards in trios, then defense in pairs; skaters with no 5v5 time are left out. */
export declare function orderPlayers(players: ChartPlayer[], fiveOnFive: FiveOnFive): {
    forwards: ChartPlayer[];
    defense: ChartPlayer[];
};
//# sourceMappingURL=toiChart.d.ts.map