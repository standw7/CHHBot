import { Client } from 'discord.js';
export interface LiveStatusInput {
    teamCode: string;
    homeTeam: {
        abbrev: string;
        score: number;
    };
    awayTeam: {
        abbrev: string;
        score: number;
    };
    periodDescriptor?: {
        number: number;
        periodType: string;
        maxRegulationPeriods?: number;
    };
    period?: number;
    clock: {
        timeRemaining: string;
        inIntermission: boolean;
    };
}
/** e.g. "UTA 2-1 EDM · 2nd 12:34" — our team always listed first. */
export declare function formatLiveStatus(input: LiveStatusInput): string;
/** e.g. "Next: vs EDM · Sat 7:00 PM MT" (home) or "Next: @ VGK · …" (away). */
export declare function formatNextGameStatus(teamCode: string, homeTeam: {
    abbrev: string;
}, awayTeam: {
    abbrev: string;
}, startTimeUTC: string, zone: string): string;
export declare function setStatus(client: Client, text: string | null): void;
//# sourceMappingURL=presence.d.ts.map