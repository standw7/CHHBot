import { EmbedBuilder } from 'discord.js';
export declare function extractDateFromQuery(query: string): {
    date: string;
    statQuery: string;
} | null;
export declare function buildGameStatsEmbed(teamCode: string, dateStr: string, statQuery: string): Promise<EmbedBuilder>;
//# sourceMappingURL=gameStats.d.ts.map