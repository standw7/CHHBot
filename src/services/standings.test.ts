import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { standingsForSeason } from './standings.js';
import type { StandingsResponse, TeamStanding } from '../nhl/types.js';

const row = (seasonId: number) => ({ teamAbbrev: { default: 'UTA' }, seasonId }) as TeamStanding;

describe('standingsForSeason', () => {
  test('returns standings from the requested season', () => {
    const res = { standings: [row(20262027)] } as StandingsResponse;
    assert.equal(standingsForSeason(res, 20262027)?.length, 1);
  });

  test('last season (e.g. during preseason) → null', () => {
    const res = { standings: [row(20252026)] } as StandingsResponse;
    assert.equal(standingsForSeason(res, 20262027), null);
  });

  test('missing response or empty standings → null', () => {
    assert.equal(standingsForSeason(null, 20262027), null);
    assert.equal(standingsForSeason({ standings: [] } as unknown as StandingsResponse, 20262027), null);
  });
});
