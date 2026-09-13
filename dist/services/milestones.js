"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectMilestones = detectMilestones;
const SEASON_GOAL_THRESHOLDS = [20, 30, 40, 50, 60, 70];
const CAREER_POINT_THRESHOLDS = [100, 250, 500, 750, 1000, 1500];
function scorerName(goal) {
    return `${goal.firstName.default} ${goal.lastName.default}`;
}
// Goals that actually count toward a player's season/career totals — i.e. not shootout goals.
function realGoalsBy(playerId, goalsSoFar) {
    return goalsSoFar.filter(g => g.playerId === playerId && g.periodType !== 'SO');
}
function assistsBy(playerId, goalsSoFar) {
    return goalsSoFar.filter(g => g.assists.some(a => a.playerId === playerId)).length;
}
function detectMilestones(input) {
    const { goal, goalsSoFar, periodType, gameType, isPrimaryTeam, careerBefore } = input;
    // Shootout goals don't count toward any real stat (goalsToDate is unchanged by an SO
    // goal, and realGoalsBy already excludes them from hat trick/career counts), so they
    // can never actually produce a milestone. Bail out before re-evaluating a goal whose
    // count was already reached by an earlier regulation goal in the same game.
    if (periodType === 'SO') {
        return [];
    }
    const milestones = [];
    // --- Factual tags: available regardless of primary team or game type ---
    const scorerRealGoals = realGoalsBy(goal.playerId, goalsSoFar);
    const goalsInGame = scorerRealGoals.length;
    const name = scorerName(goal);
    if (goalsInGame === 3) {
        milestones.push({ kind: 'hat_trick', label: `🧢🧢🧢 HAT TRICK! ${name}'s 3rd of the night`, celebrate: isPrimaryTeam });
    }
    else if (goalsInGame === 4) {
        milestones.push({ kind: 'four_goal', label: `🧢🧢🧢🧢 FOUR-GOAL GAME! ${name}`, celebrate: isPrimaryTeam });
    }
    else if (goalsInGame >= 5) {
        milestones.push({ kind: 'four_goal', label: `${goalsInGame}-GOAL GAME! ${name}`, celebrate: isPrimaryTeam });
    }
    if (periodType === 'OT') {
        milestones.push({ kind: 'ot_winner', label: 'OT WINNER!', celebrate: isPrimaryTeam });
    }
    // Season and career milestones only apply to primary-team scorers in regular-season games.
    if (!isPrimaryTeam || gameType !== 2) {
        return milestones;
    }
    if (SEASON_GOAL_THRESHOLDS.includes(goal.goalsToDate)) {
        milestones.push({ kind: 'season_goals', label: `${goal.goalsToDate}th goal of the season`, celebrate: isPrimaryTeam });
    }
    if (careerBefore) {
        const careerAfterGoals = careerBefore.goals + scorerRealGoals.length;
        const careerAfterPoints = careerBefore.points + scorerRealGoals.length + assistsBy(goal.playerId, goalsSoFar);
        if (careerAfterGoals === 1) {
            milestones.push({ kind: 'first_nhl_goal', label: 'FIRST NHL GOAL!', celebrate: isPrimaryTeam });
        }
        else {
            if (careerAfterGoals % 100 === 0) {
                milestones.push({ kind: 'career_goals', label: `Career goal #${careerAfterGoals}`, celebrate: isPrimaryTeam });
            }
            if (CAREER_POINT_THRESHOLDS.includes(careerAfterPoints)) {
                milestones.push({ kind: 'career_points', label: `Career point #${careerAfterPoints}`, celebrate: isPrimaryTeam });
            }
        }
    }
    return milestones;
}
//# sourceMappingURL=milestones.js.map