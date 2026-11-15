export interface InjuryEntry {
    name: string;
    lastName: string;
    status: string;
    designation?: string;
    part?: string;
    returnDate?: string;
}
interface EspnInjury {
    status: string;
    athlete: {
        displayName: string;
        lastName?: string;
    };
    details?: {
        type?: string;
        returnDate?: string;
        fantasyStatus?: {
            abbreviation?: string;
        };
    };
}
export interface EspnInjuryResponse {
    injuries?: {
        displayName: string;
        injuries: EspnInjury[];
    }[];
}
/** Lowercase, accents and punctuation stripped, so "Montréal" matches "Montreal" and "J.J." matches "JJ". */
export declare function normalizeName(name: string): string;
/** Day-to-day players may still play; everyone else on the report is out. */
export declare function isOut(status: string): boolean;
/** One team's injuries, keyed by normalized player name, from an ESPN report. */
export declare function teamInjuries(report: EspnInjuryResponse, teamFullName: string): Map<string, InjuryEntry> | null;
/**
 * Card lines, soonest estimated return first: "**Guenther** — IR · upper body · est. return Dec 5".
 * Return dates on or before `todayISO` are left off (stale estimates).
 */
export declare function formatInjuryLines(injuries: Map<string, InjuryEntry>, todayISO: string): string[];
/** The team's current injuries, or null if the report can't be loaded (callers then skip filtering). */
export declare function loadTeamInjuries(teamFullName: string): Promise<Map<string, InjuryEntry> | null>;
export {};
//# sourceMappingURL=injuries.d.ts.map