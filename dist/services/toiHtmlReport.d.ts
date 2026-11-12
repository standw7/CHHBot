import type { ShiftChartRow } from '../nhl/types.js';
/** e.g. 2026020164 → https://www.nhl.com/scores/htmlreports/20262027/TH020164.HTM */
export declare function shiftReportUrl(gameId: number, side: 'home' | 'away'): string;
/**
 * Shifts for one team's report. `sweaterToId` maps jersey number → NHL playerId for that
 * team (from the boxscore); players not in it are skipped.
 */
export declare function parseShiftReport(html: string, teamAbbrev: string, sweaterToId: Map<number, number>): ShiftChartRow[];
export interface ReportTeam {
    abbrev: string;
    players: {
        playerId: number;
        sweaterNumber?: number;
    }[];
}
/** Both teams' shifts from the HTML reports, or null if either report can't be fetched. */
export declare function fetchShiftReports(gameId: number, home: ReportTeam, away: ReportTeam): Promise<ShiftChartRow[] | null>;
//# sourceMappingURL=toiHtmlReport.d.ts.map