import { Client, EmbedBuilder, Guild } from 'discord.js';
import type { ScheduleGame, TeamStanding } from '../nhl/types.js';
export declare const DEFAULT_SEASON_START = "2026-09-29";
export declare const DEFAULT_SEASON_END = "2027-04-10";
export declare function startDailyCardService(client: Client): void;
export declare function stopDailyCardService(): void;
export type DailyCardSelection = {
    kind: 'game';
    game: ScheduleGame;
} | {
    kind: 'offday';
    nextGame?: ScheduleGame;
} | {
    kind: 'none';
};
export interface SeasonWindow {
    start: string;
    end: string;
}
export declare function selectDailyCard(games: ScheduleGame[], todayISO: string, zone: string, window: SeasonWindow): DailyCardSelection;
export declare const OFF_DAY_PHRASES: string[];
export declare function pickOffDayPhrase(todayISO: string): string;
export interface SeasonSeriesRecord {
    wins: number;
    losses: number;
    otLosses: number;
}
/** Season series (regular season only) for `primaryTeam` against `opponent`, from completed games. */
export declare function calculateSeasonSeries(games: ScheduleGame[], primaryTeam: string, opponent: string): SeasonSeriesRecord;
export declare function buildPreGameCard(game: ScheduleGame, seasonGames: ScheduleGame[], primaryTeam: string, standings: TeamStanding[] | null, guild?: Guild, milestoneLines?: string[]): EmbedBuilder;
export declare function buildOffDayCard(phrase: string, nextGame: ScheduleGame | undefined, primaryTeam: string): EmbedBuilder;
//# sourceMappingURL=dailyCard.d.ts.map