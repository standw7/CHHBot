import type { StandingsResponse, TeamStanding } from '../nhl/types.js';

/**
 * The NHL keeps serving last season's final standings until the new season's
 * first games are played (i.e. all of preseason). Returns the standings only if
 * they belong to `season` (e.g. 20262027), otherwise null so callers omit records.
 */
export function standingsForSeason(response: StandingsResponse | null, season: number): TeamStanding[] | null {
  const standings = response?.standings;
  if (!standings?.length || standings[0].seasonId !== season) return null;
  return standings;
}
