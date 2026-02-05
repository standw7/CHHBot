import type { ScheduleResponse, PlayByPlayResponse, BoxscoreResponse, LandingResponse, GoalReplayResponse, TvScheduleResponse } from './types.js';
import type { ClubStatsResponse } from './statsTypes.js';
export declare function getSchedule(teamCode: string): Promise<ScheduleResponse | null>;
export declare function getWeekSchedule(teamCode: string): Promise<ScheduleResponse | null>;
export declare function getPlayByPlay(gameId: number): Promise<PlayByPlayResponse | null>;
export declare function getBoxscore(gameId: number): Promise<BoxscoreResponse | null>;
export declare function getLanding(gameId: number): Promise<LandingResponse | null>;
export declare function getGoalReplay(gameId: number, eventNumber: number): Promise<GoalReplayResponse | null>;
export declare function getTvSchedule(date?: string): Promise<TvScheduleResponse | null>;
export declare function getClubStats(teamCode: string): Promise<ClubStatsResponse | null>;
export declare function clearCache(): void;
//# sourceMappingURL=client.d.ts.map