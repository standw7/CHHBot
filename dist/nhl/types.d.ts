export interface ScheduleResponse {
    games: ScheduleGame[];
}
export interface ScheduleGame {
    id: number;
    season: number;
    gameType: number;
    gameDate: string;
    startTimeUTC: string;
    homeTeam: ScheduleTeam;
    awayTeam: ScheduleTeam;
    gameState: string;
    venue: {
        default: string;
    };
}
export interface ScheduleTeam {
    id: number;
    abbrev: string;
    name?: {
        default: string;
    };
    logo: string;
    score?: number;
}
export interface PlayByPlayResponse {
    id: number;
    gameState: string;
    period: number;
    clock: {
        timeRemaining: string;
        inIntermission: boolean;
    };
    plays: Play[];
    homeTeam: PbpTeam;
    awayTeam: PbpTeam;
}
export interface PbpTeam {
    id: number;
    abbrev: string;
    commonName?: {
        default: string;
    };
    name?: {
        default: string;
    };
    logo: string;
    score: number;
    sog?: number;
}
export interface Play {
    eventId: number;
    typeCode: number;
    typeDescKey: string;
    periodDescriptor: {
        number: number;
        periodType: string;
    };
    timeInPeriod: string;
    timeRemaining: string;
    details?: PlayDetails;
    pptReplayUrl?: string;
}
export interface PlayDetails {
    scoringPlayerId?: number;
    scoringPlayerTotal?: number;
    assist1PlayerId?: number;
    assist1PlayerTotal?: number;
    assist2PlayerId?: number;
    assist2PlayerTotal?: number;
    eventOwnerTeamId?: number;
    goalieInNetId?: number;
    shotType?: string;
    zoneCode?: string;
    xCoord?: number;
    yCoord?: number;
    awayScore?: number;
    homeScore?: number;
    highlightClipSharingUrl?: string;
    highlightClip?: number;
    discreteClip?: number;
}
export interface LandingResponse {
    id: number;
    gameState: string;
    homeTeam: BoxscoreTeam;
    awayTeam: BoxscoreTeam;
    summary?: {
        scoring?: LandingPeriodScoring[];
        threeStars?: ThreeStar[];
    };
    tvBroadcasts?: TvBroadcast[];
}
export interface LandingPeriodScoring {
    periodDescriptor: {
        number: number;
        periodType: string;
    };
    goals: LandingGoal[];
}
export interface LandingGoal {
    situationCode?: string;
    eventId: number;
    strength: string;
    playerId: number;
    firstName: {
        default: string;
    };
    lastName: {
        default: string;
    };
    name: {
        default: string;
    };
    teamAbbrev: {
        default: string;
    };
    headshot?: string;
    goalsToDate: number;
    awayScore: number;
    homeScore: number;
    leadingTeamAbbrev?: {
        default: string;
    };
    timeInPeriod: string;
    shotType?: string;
    goalModifier?: string;
    assists: LandingAssist[];
    highlightClipSharingUrl?: string;
    pptReplayUrl?: string;
    isHome?: boolean;
    sweaterNumber?: number;
}
export interface LandingAssist {
    playerId: number;
    firstName: {
        default: string;
    };
    lastName: {
        default: string;
    };
    name: {
        default: string;
    };
    assistsToDate: number;
    sweaterNumber?: number;
}
export interface BoxscoreResponse {
    id: number;
    gameState: string;
    homeTeam: BoxscoreTeam;
    awayTeam: BoxscoreTeam;
    summary?: {
        threeStars?: ThreeStar[];
    };
}
export interface BoxscoreTeam {
    id: number;
    abbrev: string;
    name?: {
        default: string;
    };
    logo: string;
    score: number;
    sog: number;
}
export interface ThreeStar {
    star: number;
    id: number;
    name?: {
        default: string;
    };
    firstName?: {
        default: string;
    };
    lastName?: {
        default: string;
    };
    sweaterNumber?: number;
    teamAbbrev?: string;
    position?: string;
}
export interface TvBroadcast {
    id: number;
    market: string;
    countryCode: string;
    network: string;
    sequenceNumber?: number;
}
export interface GoalReplayResponse {
    topClip?: {
        playbackUrl?: string;
        duration?: number;
        title?: string;
    };
    clips?: Array<{
        playbackUrl?: string;
        duration?: number;
        title?: string;
    }>;
}
export interface TvScheduleResponse {
    games?: TvScheduleGame[];
}
export interface TvScheduleGame {
    id: number;
    startTimeUTC: string;
    homeTeam: {
        abbrev: string;
    };
    awayTeam: {
        abbrev: string;
    };
    tvBroadcasts?: TvBroadcast[];
}
export interface StandingsResponse {
    standings: TeamStanding[];
}
export interface TeamStanding {
    teamAbbrev: {
        default: string;
    };
    teamName: {
        default: string;
    };
    teamLogo: string;
    gamesPlayed: number;
    wins: number;
    losses: number;
    otLosses: number;
    points: number;
    streakCode: string;
    streakCount: number;
}
//# sourceMappingURL=types.d.ts.map