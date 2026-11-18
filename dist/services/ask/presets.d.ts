export interface StarterPreset {
    triggers: string[];
    exactOnly?: string[];
    responses: string[];
}
export declare const STARTER_PRESETS: StarterPreset[];
/** Shown when someone mentions Tusky with nothing else. */
export declare const EMPTY_PING_REPLIES: string[];
/** Off-topic questions (and everything the LLM tier can't take when it's disabled). */
export declare const DEFLECTIONS: string[];
export declare const CAPPED_USER_REPLIES: string[];
export declare const CAPPED_GUILD_REPLIES: string[];
export declare const ERROR_REPLIES: string[];
export declare function pickRandom<T>(items: readonly T[], rng?: () => number): T;
/** Starter set flattened to DB rows (one row per trigger × response). */
export declare function starterPresetRows(): {
    trigger: string;
    response: string;
    exactOnly: boolean;
}[];
export interface PresetGroup {
    trigger: string;
    exactOnly: boolean;
    responses: {
        id?: number;
        response: string;
    }[];
}
/** Groups DB rows by (trigger, exact_only) so each trigger picks among its responses. */
export declare function groupPresets(rows: {
    id?: number;
    trigger: string;
    response: string;
    exact_only: number | boolean;
}[]): PresetGroup[];
/**
 * A phrase trigger only fires on a "clean hit": its words make up at least this share of
 * the message's non-filler words ("thanks so much" yes; "thanks, but when is the game" no).
 */
export declare const MIN_TRIGGER_COVERAGE = 0.7;
/** Best preset for a normalized message: longest matching trigger wins. */
export declare function matchPreset(normalized: string, groups: PresetGroup[]): PresetGroup | null;
/** Replaces {name} placeholders that have a value; unknown ones are left as-is. */
export declare function fillTemplate(text: string, vars: Record<string, string>): string;
export type AddPresetParse = {
    ok: true;
    trigger: string;
    response: string;
    exactOnly: boolean;
} | {
    ok: false;
    error: string;
};
/**
 * Parses `<trigger> => <response>` (the part after `!ask add`). Prefix the trigger with
 * `exact:` to make it fire only when it is the whole message; one-word triggers of up to
 * three letters ("hi", "gm") are exact-only automatically.
 */
export declare function parseAddPreset(raw: string): AddPresetParse;
//# sourceMappingURL=presets.d.ts.map