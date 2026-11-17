import { Client, MessageCreateOptions } from 'discord.js';
import type { ShiftChartRow, BoxscoreTeamPlayers, ScheduleGame } from '../nhl/types.js';
import type { ToiChartInput, LinesChartInput } from './toiRender.js';
/** One side of a boxscore: abbreviation + its players. */
export interface BoxTeam extends BoxscoreTeamPlayers {
    abbrev: string;
}
/** Boxscore TOI "08:12" -> "8:12". */
export declare function formatToi(mmss: string): string;
/** Both post-game charts' inputs, from one pass over the shift data. */
export interface ToiChartInputs {
    against: ToiChartInput;
    lines: LinesChartInput;
}
/**
 * Chart inputs for `teamCode`: time against its opponent (our rows × their columns) and our
 * line pairings (our skaters × our skaters). null if the team isn't in this game, or
 * 'incomplete' while shift data doesn't yet match the boxscore.
 */
export declare function toiChartInputFromGame(rows: ShiftChartRow[], home: BoxTeam, away: BoxTeam, teamCode: string): ToiChartInputs | 'incomplete' | null;
export declare function toiChartTitle(awayAbbrev: string, homeAbbrev: string, gameDate: string): string;
export declare function linesChartTitle(awayAbbrev: string, homeAbbrev: string, gameDate: string): string;
export interface RenderedChart {
    png: Buffer;
    title: string;
}
/** The post-game TOI charts: time against opponents, then line combinations. */
export interface ToiCharts {
    against: RenderedChart;
    lines: RenderedChart;
}
/** Latest finished regular-season or playoff game, or null. */
export declare function pickLatestCompletedGame(games: ScheduleGame[]): number | null;
export declare function latestCompletedGameId(teamCode: string): Promise<number | null>;
/**
 * Fetch, check and render both charts. null if the game can't be loaded or doesn't involve the team.
 * Uses the shiftcharts API, falling back to the HTML shift reports when the API's data
 * is missing or incomplete (the API is never populated for some games).
 */
export declare function loadToiChart(gameId: number, teamCode: string): Promise<ToiCharts | 'incomplete' | null>;
/** One message, both charts: titles in image order. */
export declare function toiMessage(charts: ToiCharts, gameId: number): MessageCreateOptions;
/** Line combinations matrix — posted to the news channel only, not gameday. */
export declare function linesMessage(charts: ToiCharts, gameId: number): MessageCreateOptions;
/** Send to the guild's news and gameday channels (whichever are configured). */
export declare function postToChannels(client: Client, guildId: string, payload: MessageCreateOptions, channels?: 'news+gameday' | 'news'): Promise<void>;
//# sourceMappingURL=toiPost.d.ts.map