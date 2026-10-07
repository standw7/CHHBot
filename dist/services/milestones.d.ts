import type { LandingGoal } from '../nhl/types.js';
export interface CareerTotals {
    goals: number;
    points: number;
    assists?: number;
}
export interface MilestoneInput {
    goal: LandingGoal;
    goalsSoFar: LandingGoal[];
    periodType: string;
    gameType: number;
    isPrimaryTeam: boolean;
    careerBefore?: CareerTotals;
    assistersCareerBefore?: Map<number, CareerTotals>;
}
export interface Milestone {
    kind: 'hat_trick' | 'four_goal' | 'ot_winner' | 'first_nhl_goal' | 'season_goals' | 'career_goals' | 'career_points' | 'career_assists';
    label: string;
    celebrate: boolean;
}
export declare const SEASON_GOAL_THRESHOLDS: number[];
export declare function detectMilestones(input: MilestoneInput): Milestone[];
//# sourceMappingURL=milestones.d.ts.map