import { EmbedBuilder } from 'discord.js';
import type { SkaterStats, GoalieStats } from '../nhl/statsTypes.js';
interface StatCategory {
    key: string;
    label: string;
    abbrev: string;
    type: 'skater' | 'goalie';
    field: keyof SkaterStats | keyof GoalieStats;
    sortAscending?: boolean;
    format?: (value: number) => string;
}
export declare function matchStatCategory(input: string): StatCategory;
export declare function buildStatsEmbed(teamCode: string, query: string): Promise<EmbedBuilder>;
export declare function buildStatsHelpEmbed(): EmbedBuilder;
export {};
//# sourceMappingURL=statsLookup.d.ts.map