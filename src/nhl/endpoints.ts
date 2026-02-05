const BASE_URL = 'https://api-web.nhle.com';

export function scheduleUrl(teamCode: string): string {
  return `${BASE_URL}/v1/club-schedule-season/${teamCode}/now`;
}

export function weekScheduleUrl(teamCode: string): string {
  return `${BASE_URL}/v1/club-schedule/${teamCode}/week/now`;
}

export function playByPlayUrl(gameId: number): string {
  return `${BASE_URL}/v1/gamecenter/${gameId}/play-by-play`;
}

export function boxscoreUrl(gameId: number): string {
  return `${BASE_URL}/v1/gamecenter/${gameId}/boxscore`;
}

export function landingUrl(gameId: number): string {
  return `${BASE_URL}/v1/gamecenter/${gameId}/landing`;
}

export function goalReplayUrl(gameId: number, eventNumber: number): string {
  return `${BASE_URL}/v1/ppt-replay/goal/${gameId}/${eventNumber}`;
}

export function tvScheduleNowUrl(): string {
  return `${BASE_URL}/v1/network/tv-schedule/now`;
}

export function tvScheduleDateUrl(date: string): string {
  return `${BASE_URL}/v1/network/tv-schedule/${date}`;
}

export function clubStatsUrl(teamCode: string): string {
  return `${BASE_URL}/v1/club-stats/${teamCode}/now`;
}

export function gamecenterWebUrl(gameId: number): string {
  return `https://www.nhl.com/gamecenter/${gameId}`;
}

export function standingsUrl(): string {
  return `${BASE_URL}/v1/standings/now`;
}
