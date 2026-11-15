import { EmbedBuilder } from 'discord.js';
export declare const XG_VICTIM: {
    playerId: number;
    firstName: string;
    lastName: string;
    team: string;
    memeKey: string;
};
export declare const ALWAYS_POST_XG = 0.3;
export declare const MAX_SHOT_AGE_SECONDS = 180;
export interface VictimShot {
    id: string;
    gameSeconds: number;
    event: 'SHOT' | 'MISS' | 'GOAL';
    xg: number;
    sweaterNumber?: number;
    shotType?: string;
    missReason?: string;
}
/**
 * The victim's unblocked shots from MoneyPuck's live per-game CSV. MoneyPuck has no
 * shooter id column, so the shooter comes from the description, e.g.
 * "UTA ONGOAL - #27 HAYTON  Wrist   Off. Zone  25 ft." / "UTA #27 HAYTON  Snap  Wide Left  Off. Zone  28 ft."
 */
export declare function parseVictimShots(csv: string, team: string, lastName: string): VictimShot[];
export declare function postChance(xg: number): number;
export interface SeasonTotals {
    xg: number;
    goals: number;
}
/** Goals owed: expected minus actual, season-to-date before tonight plus tonight. */
export declare function goalsOwed(season: SeasonTotals, tonightXg: number, tonightGoals: number): number;
/** Banner for the victim's real goal card. owed is after this goal; undefined if unknown. */
export declare function debtPaymentLabel(owed: number | undefined): string;
export declare const QUIPS: string[];
export declare function pickQuip(xg: number, random?: () => number): string;
/** "4:12 left in the 2nd" / "1:30 left in OT", from MoneyPuck's elapsed game seconds. */
export declare function clockText(gameSeconds: number, gameType: number): string;
export interface XgCardInput {
    shot: VictimShot;
    tonight: VictimShot[];
    season?: SeasonTotals;
    gameType: number;
    quip: string;
    headshot?: string;
}
export declare function buildXgCard(input: XgCardInput): EmbedBuilder;
//# sourceMappingURL=xgVictim.d.ts.map