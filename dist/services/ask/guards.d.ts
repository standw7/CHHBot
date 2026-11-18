export declare const ASK_COOLDOWN_MS = 5000;
export declare const ASK_ZONE = "America/Denver";
/** In-memory per-user cooldown. `tryAcquire` returns false while the user is cooling down. */
export declare class Cooldown {
    private readonly ms;
    private last;
    constructor(ms?: number);
    tryAcquire(userId: string, now?: number): boolean;
    prune(now?: number): void;
    get size(): number;
}
export interface CapLimits {
    user: number;
    guild: number;
    /** Guild-wide web searches per day; 0 turns web search off. Applies to cap-exempt users too. */
    search?: number;
}
export type CapDecision = {
    ok: true;
} | {
    ok: false;
    scope: 'user' | 'guild';
};
/** Daily LLM caps: usage = LLM calls already made today. A cap of 0 disables the LLM. */
export declare function checkCaps(usage: {
    user: number;
    guild: number;
}, limits: CapLimits): CapDecision;
/** Mod-level permissions that lift the daily caps (Discord permission flag names). */
export declare const UNCAPPED_PERMISSIONS: readonly ["Administrator", "ManageGuild", "ManageMessages", "ModerateMembers"];
/**
 * Mods and the Clean Hits Crew have no daily cap (the per-user cooldown still applies).
 * Pure: takes the member's permission check and role names so it's unit tested directly.
 */
export declare function isCapExempt(hasPermission: (flag: (typeof UNCAPPED_PERMISSIONS)[number]) => boolean, roleNames: string[], crewRoleName: string): boolean;
/** The cap "day" (YYYY-MM-DD in America/Denver). */
export declare function askDay(now?: Date): string;
/** "Tuesday, November 17, 2026" in America/Denver (goes in the LLM user turn). */
export declare function todayLong(now?: Date): string;
//# sourceMappingURL=guards.d.ts.map