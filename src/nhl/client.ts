import pino from 'pino';
import * as endpoints from './endpoints.js';
import type {
  ScheduleResponse,
  PlayByPlayResponse,
  BoxscoreResponse,
  LandingResponse,
  GoalReplayResponse,
  TvScheduleResponse,
} from './types.js';

const logger = pino({ name: 'nhl-client' });

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const SCHEDULE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CACHE_TTL = 30 * 1000; // 30 seconds

async function fetchJson<T>(url: string, cacheTtl: number = DEFAULT_CACHE_TTL): Promise<T | null> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn({ url, status: 404 }, 'NHL API returned 404');
          return null;
        }
        if (response.status === 429 || response.status >= 500) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn({ url, status: response.status, attempt, delay }, 'NHL API error, retrying');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        logger.error({ url, status: response.status }, 'NHL API unexpected status');
        return null;
      }

      const data = await response.json() as T;
      cache.set(url, { data, expiresAt: Date.now() + cacheTtl });
      return data;
    } catch (error) {
      const delay = Math.pow(2, attempt) * 1000;
      logger.error({ url, attempt, error }, 'NHL API fetch error, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  logger.error({ url }, 'NHL API request failed after 3 attempts');
  return null;
}

export async function getSchedule(teamCode: string): Promise<ScheduleResponse | null> {
  return fetchJson<ScheduleResponse>(endpoints.scheduleUrl(teamCode), SCHEDULE_CACHE_TTL);
}

export async function getWeekSchedule(teamCode: string): Promise<ScheduleResponse | null> {
  return fetchJson<ScheduleResponse>(endpoints.weekScheduleUrl(teamCode), SCHEDULE_CACHE_TTL);
}

export async function getPlayByPlay(gameId: number): Promise<PlayByPlayResponse | null> {
  return fetchJson<PlayByPlayResponse>(endpoints.playByPlayUrl(gameId));
}

export async function getBoxscore(gameId: number): Promise<BoxscoreResponse | null> {
  return fetchJson<BoxscoreResponse>(endpoints.boxscoreUrl(gameId));
}

export async function getLanding(gameId: number): Promise<LandingResponse | null> {
  return fetchJson<LandingResponse>(endpoints.landingUrl(gameId));
}

export async function getGoalReplay(gameId: number, eventNumber: number): Promise<GoalReplayResponse | null> {
  return fetchJson<GoalReplayResponse>(endpoints.goalReplayUrl(gameId, eventNumber));
}

export async function getTvSchedule(date?: string): Promise<TvScheduleResponse | null> {
  const url = date ? endpoints.tvScheduleDateUrl(date) : endpoints.tvScheduleNowUrl();
  return fetchJson<TvScheduleResponse>(url, SCHEDULE_CACHE_TTL);
}

export function clearCache(): void {
  cache.clear();
}
