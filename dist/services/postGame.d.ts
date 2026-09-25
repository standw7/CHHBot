import { Client, EmbedBuilder, Guild, Message } from 'discord.js';
import type { TeamStanding, ThreeStar } from '../nhl/types.js';
/**
 * e.g. "**3rd in Central** (↑ from 4th) · 94 pts · holding a division playoff spot".
 * `before` is the pre-game snapshot (null → no arrow). Returns null if the team is missing.
 */
export declare function formatStandingsLine(before: TeamStanding[] | null, after: TeamStanding[], team: string): string | null;
/** e.g. "2G 1A" for skaters, ".957 SV%, 1.01 GAA" for goalies. */
export declare function formatStarStats(star: ThreeStar): string;
/** e.g. "⭐ C. Keller (UTA): 2G 1A" or "⭐⭐⭐ K. Vejmelka (UTA): .957 SV%, 1.01 GAA". */
export declare function formatStarLine(star: ThreeStar): string;
export declare function buildThreeStarsCard(stars: ThreeStar[], awayAbbrev: string, homeAbbrev: string, guild?: Guild): EmbedBuilder;
export interface PostGameFollowUp {
    client: Client;
    guildId: string;
    channelId: string;
    gameId: number;
    teamCode: string;
    awayAbbrev: string;
    homeAbbrev: string;
    finalMessage: Message | null;
    standingsBefore: TeamStanding[] | null;
    trackStandings: boolean;
}
/**
 * Polls once a minute (up to an hour): edits the standings line into the final card
 * once the team's games played increments, and posts the three stars card once the
 * NHL publishes them. Not persisted — a restart drops a pending follow-up.
 */
export declare function startPostGameFollowUp(f: PostGameFollowUp): void;
//# sourceMappingURL=postGame.d.ts.map