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
/** The cap "day" (YYYY-MM-DD in America/Denver). */
export declare function askDay(now?: Date): string;
/** "Tuesday, November 17, 2026" in America/Denver (goes in the LLM user turn). */
export declare function todayLong(now?: Date): string;
//# sourceMappingURL=guards.d.ts.map