export type SpoilerMode = 'off' | 'wrap_scores' | 'minimal_embed';
export declare function wrapScore(text: string, mode: SpoilerMode): string;
export declare function shouldIncludeScoresInEmbed(mode: SpoilerMode): boolean;
export declare function formatScoreLine(awayAbbrev: string, awayScore: number, homeAbbrev: string, homeScore: number, awaySog: number | undefined, homeSog: number | undefined, mode: SpoilerMode): string | null;
//# sourceMappingURL=spoiler.d.ts.map