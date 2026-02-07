// Types for NHL api-web responses (unofficial API)

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

// --- Play-by-Play ---

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
  commonName?: { default: string };
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
  details?: PlayDetails;
  pptReplayUrl?: string;
}

export interface PlayDetails {
  // Goal-specific fields from play-by-play (IDs only, no names)
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
  // Highlight clip URLs (available directly on play-by-play goal events)
  highlightClipSharingUrl?: string;
  highlightClip?: number;
  discreteClip?: number;
}

// --- Landing endpoint (has rich goal data with names) ---

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
  strength: string; // "ev", "pp", "sh"
  playerId: number;
  firstName: { default: string };
  lastName: { default: string };
  name: { default: string };
  teamAbbrev: { default: string };
  headshot?: string;
  goalsToDate: number;
  awayScore: number;
  homeScore: number;
  leadingTeamAbbrev?: { default: string };
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
  firstName: { default: string };
  lastName: { default: string };
  name: { default: string };
  assistsToDate: number;
  sweaterNumber?: number;
}

// --- Boxscore ---

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

// --- Standings ---

export interface StandingsResponse {
  standings: TeamStanding[];
}

export interface TeamStanding {
  teamAbbrev: { default: string };
  teamName: { default: string };
  teamLogo: string;
  divisionName: string;
  conferenceName: string;
  divisionSequence: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  streakCode: string; // "W", "L", "OT"
  streakCount: number;
}

// --- Player Search ---

export interface PlayerSearchResult {
  playerId: string;
  name: string;
  positionCode: string;
  teamAbbrev: string;
  lastTeamAbbrev?: string;
  sweaterNumber?: number;
  active: boolean;
  height: string;
  weightInPounds: number;
  birthDate: string;
  birthCity: string;
  birthCountry: string;
}

// --- Player Stats ---

export interface PlayerLandingResponse {
  playerId: number;
  isActive: boolean;
  firstName: { default: string };
  lastName: { default: string };
  sweaterNumber: number;
  position: string;
  headshot: string;
  heroImage?: string;
  teamLogo?: string;
  currentTeamAbbrev?: string;
  currentTeamId?: number;
  heightInInches: number;
  weightInPounds: number;
  birthDate: string;
  birthCity: { default: string };
  birthCountry: string;
  shootsCatches: string;
  featuredStats?: {
    season: number;
    regularSeason?: {
      subSeason: PlayerSeasonStats;
      career: PlayerSeasonStats;
    };
  };
  careerTotals?: {
    regularSeason?: PlayerSeasonStats;
  };
  last5Games?: PlayerGameLog[];
}

export interface PlayerSeasonStats {
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  gameWinningGoals: number;
  otGoals: number;
  powerPlayGoals: number;
  powerPlayPoints: number;
  shorthandedGoals: number;
  shorthandedPoints: number;
  shots: number;
  shootingPctg: number;
  avgToi: string;
  faceoffWinningPctg: number;
  // Goalie stats
  wins?: number;
  losses?: number;
  otLosses?: number;
  goalsAgainstAvg?: number;
  savePctg?: number;
  shutouts?: number;
  gamesStarted?: number;
}

export interface PlayerGameLog {
  gameId: number;
  gameDate: string;
  teamAbbrev: string;
  opponentAbbrev: string;
  goals?: number;
  assists?: number;
  points?: number;
  plusMinus?: number;
  pim?: number;
  shots?: number;
  toi?: string;
  // Goalie
  gamesStarted?: number;
  decision?: string;
  goalsAgainst?: number;
  savePctg?: number;
  shotsAgainst?: number;
}
