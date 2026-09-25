import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatStandingsLine, formatStarLine, formatStarStats, buildThreeStarsCard } from './postGame.js';
import type { TeamStanding, ThreeStar } from '../nhl/types.js';

function team(abbrev: string, overrides: Partial<TeamStanding>): TeamStanding {
  return {
    teamAbbrev: { default: abbrev },
    teamName: { default: abbrev },
    teamLogo: '',
    divisionName: 'Central',
    conferenceName: 'Western',
    conferenceAbbrev: 'W',
    divisionSequence: 1,
    wildcardSequence: 0,
    gamesPlayed: 10,
    wins: 5,
    losses: 5,
    otLosses: 0,
    points: 10,
    streakCode: 'W',
    streakCount: 1,
    ...overrides,
  };
}

describe('formatStandingsLine', () => {
  test('moved up into a division playoff spot', () => {
    const before = [team('UTA', { divisionSequence: 4, points: 92 })];
    const after = [team('UTA', { divisionSequence: 3, points: 94, gamesPlayed: 11 })];
    assert.equal(
      formatStandingsLine(before, after, 'UTA'),
      '**3rd in Central** (↑ from 4th) · 94 pts · holding a division playoff spot'
    );
  });

  test('moved down, out of a wild card spot by 2 pts', () => {
    const before = [team('UTA', { divisionSequence: 4, wildcardSequence: 2, points: 88 })];
    const after = [
      team('UTA', { divisionSequence: 5, wildcardSequence: 3, points: 88 }),
      team('DAL', { divisionSequence: 4, wildcardSequence: 2, points: 90 }),
      team('EDM', { divisionName: 'Pacific', divisionSequence: 4, wildcardSequence: 1, points: 91 }),
      team('BOS', { conferenceAbbrev: 'E', conferenceName: 'Eastern', divisionName: 'Atlantic', wildcardSequence: 2, points: 99 }),
    ];
    assert.equal(
      formatStandingsLine(before, after, 'UTA'),
      '**5th in Central** (↓ from 4th) · 88 pts · 2 pts out of a wild card spot'
    );
  });

  test('same place, holding a wild card', () => {
    const before = [team('UTA', { divisionSequence: 4, wildcardSequence: 2, points: 88 })];
    const after = [team('UTA', { divisionSequence: 4, wildcardSequence: 2, points: 90 })];
    assert.equal(formatStandingsLine(before, after, 'UTA'), '**4th in Central** · 90 pts · 2nd wild card');
  });

  test('tied on points with the 2nd wild card', () => {
    const after = [
      team('UTA', { divisionSequence: 5, wildcardSequence: 3, points: 90 }),
      team('DAL', { divisionSequence: 4, wildcardSequence: 2, points: 90 }),
    ];
    assert.equal(formatStandingsLine(null, after, 'UTA'), '**5th in Central** · 90 pts · tied on points with the 2nd wild card');
  });

  test('no before snapshot: no arrow', () => {
    const after = [team('UTA', { divisionSequence: 1, points: 20 })];
    assert.equal(formatStandingsLine(null, after, 'UTA'), '**1st in Central** · 20 pts · holding a division playoff spot');
  });

  test('team missing from standings → null', () => {
    assert.equal(formatStandingsLine(null, [team('DAL', {})], 'UTA'), null);
  });
});

describe('three stars', () => {
  const skater: ThreeStar = {
    star: 1, playerId: 8479343, name: { default: 'C. Keller' }, teamAbbrev: 'UTA', position: 'C',
    headshot: 'https://example.com/keller.png', goals: 2, assists: 1, points: 3,
  };
  const goalie: ThreeStar = {
    star: 3, playerId: 8478872, name: { default: 'K. Vejmelka' }, teamAbbrev: 'UTA', position: 'G',
    headshot: 'https://example.com/vejmelka.png', goalsAgainstAverage: 1.01, savePctg: 0.957,
  };

  test('skater line', () => {
    assert.equal(formatStarLine(skater), '⭐ C. Keller (UTA): 2G 1A');
  });

  test('stats only', () => {
    assert.equal(formatStarStats(skater), '2G 1A');
    assert.equal(formatStarStats(goalie), '.957 SV%, 1.01 GAA');
  });

  test('goalie line', () => {
    assert.equal(formatStarLine(goalie), '⭐⭐⭐ K. Vejmelka (UTA): .957 SV%, 1.01 GAA');
  });

  test('card: title, stars in order, first star headshot', () => {
    const second: ThreeStar = { ...skater, star: 2, name: { default: 'M. Marner' }, teamAbbrev: 'VGK', goals: 1, assists: 2 };
    const embed = buildThreeStarsCard([goalie, skater, second], 'UTA', 'VGK');
    assert.equal(embed.data.title, '⭐ Three Stars · UTA @ VGK');
    assert.equal(
      embed.data.description,
      '⭐ C. Keller (UTA): 2G 1A\n⭐⭐ M. Marner (VGK): 1G 2A\n⭐⭐⭐ K. Vejmelka (UTA): .957 SV%, 1.01 GAA'
    );
    assert.equal(embed.data.thumbnail?.url, 'https://example.com/keller.png');
  });
});
