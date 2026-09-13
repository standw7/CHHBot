import type { LandingGoal } from '../nhl/types.js';
export interface MilestoneInput {
    goal: LandingGoal;
    goalsSoFar: LandingGoal[];
    periodType: string;
    gameType: number;
    isPrimaryTeam: boolean;
    careerBefore?: {
        goals: number;
        points: number;
    };
}
export interface Milestone {
    kind: 'hat_trick' | 'four_goal' | 'ot_winner' | 'first_nhl_goal' | 'season_goals' | 'career_goals' | 'career_points';
    label: string;
    celebrate: boolean;
}
export declare function detectMilestones(input: MilestoneInput): Milestone[];
//# sourceMappingURL=milestones.d.ts.map