export interface ClubStatsResponse {
    skaters: SkaterStats[];
    goalies: GoalieStats[];
}
export interface SkaterStats {
    playerId: number;
    headshot: string;
    firstName: {
        default: string;
    };
    lastName: {
        default: string;
    };
    positionCode: string;
    gamesPlayed: number;
    goals: number;
    assists: number;
    points: number;
    plusMinus: number;
    penaltyMinutes: number;
    powerPlayGoals: number;
    shorthandedGoals: number;
    gameWinningGoals: number;
    overtimeGoals: number;
    shots: number;
    shootingPctg: number;
    avgTimeOnIcePerGame: number;
    avgShiftsPerGame: number;
    faceoffWinPctg: number;
}
export interface GoalieStats {
    playerId: number;
    headshot: string;
    firstName: {
        default: string;
    };
    lastName: {
        default: string;
    };
    gamesPlayed: number;
    gamesStarted: number;
    wins: number;
    losses: number;
    overtimeLosses: number;
    goalsAgainstAverage: number;
    savePercentage: number;
    shotsAgainst: number;
    saves: number;
    goalsAgainst: number;
    shutouts: number;
}
//# sourceMappingURL=statsTypes.d.ts.map