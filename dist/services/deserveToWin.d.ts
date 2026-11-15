import { MessageCreateOptions } from 'discord.js';
export declare const SIMULATIONS = 10000;
export interface MpShot {
    time: number;
    team: 'HOME' | 'AWAY';
    xg: number;
    sequence: string;
    emptyNet: boolean;
    homeSkaters: number;
    awaySkaters: number;
}
export interface MpGame {
    shots: MpShot[];
    ended: boolean;
    homeGoals: number;
    awayGoals: number;
}
/** e.g. 2026020164 → https://moneypuck.com/moneypuck/gameData/20262027/2026020164.csv */
export declare function gameDataUrl(gameId: number): string;
/** Parses MoneyPuck's per-game CSV by header name. MoneyPuck's own page splits on commas the same way. */
export declare function parseGameCsv(csv: string): MpGame;
/**
 * Share of simulated games the home team wins (ties count half), mirroring MoneyPuck's
 * runSimulation(): one goal per shot sequence (no double-counting rebounds), and
 * empty-net / extra-attacker goals that wouldn't have happened at the simulated score
 * are thrown out.
 */
export declare function simulateHomeWinShare(shots: MpShot[], n?: number, random?: () => number): number;
export interface MeterInput {
    awayAbbrev: string;
    homeAbbrev: string;
    awayScore: number;
    homeScore: number;
    homeShare: number;
    teamCode: string;
    endedIn?: string;
}
/**
 * Half-circle gauge: away fills from the left, home from the right, meeting at the split.
 * Our team in Mountain Blue, the opponent in grey, round-capped strokes with a small gap
 * at the split, a scale of ticks inside, and our share as the big centre number.
 */
export declare function buildMeterSvg(m: MeterInput): string;
/**
 * Renders the meter once MoneyPuck has the whole game (its GEND row). 'incomplete'
 * until then; null if the game can't be loaded or doesn't involve the team.
 */
export declare function loadDeserveToWin(gameId: number, teamCode: string): Promise<{
    png: Buffer;
    title: string;
    ours: number;
} | 'incomplete' | null>;
export declare function meterMessage(meter: {
    png: Buffer;
    title: string;
    ours: number;
}, gameId: number, teamCode: string): MessageCreateOptions;
//# sourceMappingURL=deserveToWin.d.ts.map