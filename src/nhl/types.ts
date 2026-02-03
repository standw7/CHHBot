// Types for NHL api-web responses (unofficial API, fields may vary)

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
  gameState: string; // FUT, PRE, LIVE, CRIT, FINAL, OFF
  venue: { default: string };
}

export interface ScheduleTeam {
  id: number;
  abbrev: string;
  name?: { default: string };
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
  name?: { default: string };
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
    periodType: string; // REG, OT, SO
  };
  timeInPeriod: string;
  timeRemaining: string;
  details?: GoalDetails;
}

export interface GoalDetails {
  scoringPlayerId?: number;
  scoringPlayerTotal?: number;
  assists?: Assist[];
  shotType?: string;
  goalModifier?: string;
  xCoord?: number;
  yCoord?: number;
  homeScore?: number;
  awayScore?: number;
  homeSOG?: number;
  awaySOG?: number;
  eventOwnerTeamId?: number;
  scoringPlayerName?: string;
  scorerSeasonGoals?: number;
}

export interface Assist {
  playerId: number;
  firstName?: { default: string };
  lastName?: { default: string };
  assistsToDate?: number;
  name?: string;
  playerName?: string;
  seasonAssists?: number;
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
  name?: { default: string };
  logo: string;
  score: number;
  sog: number;
}

export interface ThreeStar {
  star: number;
  id: number;
  name?: { default: string };
  firstName?: { default: string };
  lastName?: { default: string };
  sweaterNumber?: number;
  teamAbbrev?: string;
  position?: string;
}

export interface LandingResponse {
  id: number;
  gameState: string;
  homeTeam: BoxscoreTeam;
  awayTeam: BoxscoreTeam;
  tvBroadcasts?: TvBroadcast[];
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
  homeTeam: { abbrev: string };
  awayTeam: { abbrev: string };
  tvBroadcasts?: TvBroadcast[];
}
