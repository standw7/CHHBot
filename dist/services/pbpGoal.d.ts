import type { LandingGoal, Play, PlayByPlayResponse } from '../nhl/types.js';
/** A landing-shaped goal built from a play-by-play goal play, or undefined if the scorer isn't in rosterSpots. */
export declare function goalFromPlay(play: Play, pbp: PlayByPlayResponse): LandingGoal | undefined;
/**
 * All goals in the game up to and including `eventId`, in order, from the play-by-play,
 * preferring the landing version of each goal when it has one. Undefined if the goal
 * itself can't be built.
 */
export declare function goalsSoFarFromPlays(pbp: PlayByPlayResponse, eventId: number, landingGoals: LandingGoal[]): LandingGoal[] | undefined;
//# sourceMappingURL=pbpGoal.d.ts.map