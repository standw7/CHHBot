import { EmbedBuilder, type Guild } from 'discord.js';
import type { SpoilerMode } from './spoiler.js';
import type { PlayerLandingResponse, ScheduleGame, TeamStanding } from '../nhl/types.js';
/** First game after `now` that hasn't started (FUT/PRE). */
export declare function findNextGame(games: ScheduleGame[], now: Date): ScheduleGame | undefined;
/** Most recent finished game (FINAL/OFF) that started before `now`. */
export declare function findLastCompletedGame(games: ScheduleGame[], now: Date): ScheduleGame | undefined;
export declare function buildNextGameEmbed(nextGame: ScheduleGame, teamCode: string, timezone: string): EmbedBuilder;
export type NextGameLookup = {
    kind: 'ok';
    embed: EmbedBuilder;
    game: ScheduleGame;
} | {
    kind: 'no_schedule';
} | {
    kind: 'none';
};
export declare function lookupNextGame(teamCode: string, timezone: string): Promise<NextGameLookup>;
/** Upcoming games as plain lines (for the LLM tool). */
export declare function lookupUpcomingGames(teamCode: string, timezone: string, count: number): Promise<string | null>;
export type LastGameLookup = {
    kind: 'ok';
    content?: string;
    embed: EmbedBuilder;
    game: ScheduleGame;
} | {
    kind: 'none';
} | {
    kind: 'unavailable';
};
/** Final card (same as the post-game one) for the most recent completed game. */
export declare function lookupLastGame(teamCode: string, spoilerMode: SpoilerMode, guild?: Guild): Promise<LastGameLookup>;
/** Playoff picture for a conference (default: the team's), or the league top 16. */
export declare function buildStandingsEmbed(standings: TeamStanding[], teamCode: string, filter?: string): EmbedBuilder;
export declare function lookupStandingsEmbed(teamCode: string, filter?: string): Promise<EmbedBuilder | null>;
/** "20262027" → "2026-27 Season"; falls back to "Season" when unknown. */
export declare function seasonLabel(season: number | undefined): string;
export type PlayerLookup = {
    kind: 'ok';
    embed: EmbedBuilder;
    stats: PlayerLandingResponse;
    name: string;
} | {
    kind: 'not_found';
} | {
    kind: 'unavailable';
    name: string;
};
/** Search a player (any NHL player; active preferred) or fetch by id, and build the !player embed. */
export declare function lookupPlayer(query: string | {
    playerId: number;
}): Promise<PlayerLookup>;
/** Title, description, fields and footer of an embed as plain text (bold markers and custom emoji stripped). */
export declare function embedToText(embed: EmbedBuilder, extra?: string, opts?: {
    footer?: boolean;
}): string;
//# sourceMappingURL=teamLookups.d.ts.map