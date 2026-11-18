/**
 * Lowercase, drop mentions/custom emoji/@everyone, strip accents and apostrophes
 * ("what's" → "whats"), turn other punctuation into spaces, collapse whitespace.
 */
export declare function normalizeText(input: string): string;
export declare function tokens(normalized: string): string[];
/** Words that don't change what's being asked ("thanks so much tusky" ≈ "thanks"). */
export declare const FILLER_WORDS: Set<string>;
export declare function contentTokens(toks: string[]): string[];
/** Drop a leading/trailing "tusky" when it's just the name being addressed ("thanks tusky" → "thanks"). */
export declare function stripVocative(normalized: string): string;
/** Cut to `max` chars on a word boundary, with an ellipsis when cut. */
export declare function truncate(text: string, max: number): string;
//# sourceMappingURL=text.d.ts.map