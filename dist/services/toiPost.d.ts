import { Client, MessageCreateOptions } from 'discord.js';
import type { ShiftChartRow, BoxscoreTeamPlayers, ScheduleGame } from '../nhl/types.js';
import type { ToiChartInput } from './toiRender.js';
/** One side of a boxscore: abbreviation + its players. */
export interface BoxTeam extends BoxscoreTeamPlayers {
    abbrev: string;
}
/**
 * Chart input for `teamCode` (rows) vs its opponent (columns), or null if the team isn't
 * in this game, or 'incomplete' while shift data doesn't yet match the boxscore.
 */
export declare function toiChartInputFromGame(rows: ShiftChartRow[], home: BoxTeam, away: BoxTeam, teamCode: string): ToiChartInput | 'incomplete' | null;
export declare function toiChartTitle(awayAbbrev: string, homeAbbrev: string, gameDate: string): string;
/** Latest finished regular-season or playoff game, or null. */
export declare function pickLatestCompletedGame(games: ScheduleGame[]): number | null;
export declare function latestCompletedGameId(teamCode: string): Promise<number | null>;
/** Fetch, check and render. null if the game can't be loaded or doesn't involve the team. */
export declare function loadToiChart(gameId: number, teamCode: string): Promise<{
    png: Buffer;
    title: string;
} | 'incomplete' | null>;
export declare function toiMessage(chart: {
    png: Buffer;
    title: string;
}, gameId: number): MessageCreateOptions;
/** Send to the guild's news and gameday channels (whichever are configured). */
export declare function postToChannels(client: Client, guildId: string, payload: MessageCreateOptions): Promise<void>;
//# sourceMappingURL=toiPost.d.ts.map