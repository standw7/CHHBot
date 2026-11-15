import { EmbedBuilder, Guild } from 'discord.js';
import type { PlayByPlayResponse, PbpTeam } from '../nhl/types.js';
import type { SpoilerMode } from './spoiler.js';
export type AttemptResult = 'goal' | 'save' | 'miss';
export interface ShootoutAttempt {
    eventId: number;
    teamAbbrev: string;
    shooter: string;
    result: AttemptResult;
    shotType?: string;
    missReason?: string;
}
export interface ShootoutState {
    away: PbpTeam;
    home: PbpTeam;
    attempts: ShootoutAttempt[];
    complete: boolean;
}
export declare function shootoutState(pbp: PlayByPlayResponse): ShootoutState | null;
/** True once one team has won: out of reach within the first 3 rounds, or ahead after an even round. */
export declare function isDecided(attempts: ShootoutAttempt[], away: string, home: string): boolean;
export declare function goalsFor(state: ShootoutState, abbrev: string): number;
export declare function buildShootoutCard(state: ShootoutState, spoilerMode: SpoilerMode, primaryTeam?: string, guild?: Guild): EmbedBuilder;
//# sourceMappingURL=shootoutCard.d.ts.map