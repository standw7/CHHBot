import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gameDataUrl, parseGameCsv, simulateHomeWinShare, buildMeterSvg } from './deserveToWin.js';
import type { MpShot } from './deserveToWin.js';

const HEADER = 'shotID,time,period,homeTeamGoals,awayTeamGoals,event,team,shotGoalProbability,sequence,shotOnEmptyNet,homeSkatersOnIce,awaySkatersOnIce';
const shot = (o: Partial<MpShot> & Pick<MpShot, 'team' | 'xg'>, seq: string, time = 100): MpShot =>
  ({ time, sequence: seq, emptyNet: false, homeSkaters: 5, awaySkaters: 5, ...o });

describe('gameDataUrl', () => {
  test('uses the season folder', () => {
    assert.equal(gameDataUrl(2026020164), 'https://moneypuck.com/moneypuck/gameData/20262027/2026020164.csv');
  });
});

describe('parseGameCsv', () => {
  const csv = [
    HEADER,
    '1,30,1,0,0,SHOT,HOME,0.1,1,0,5,5',
    '2,40,1,0,0,FAC,,,2,,5,5',
    '3,50,1,0,1,GOAL,AWAY,0.3,3,0,5,5',
    'broken,row',
    '4,3600,3,0,1,GEND,,,4,,5,5',
  ].join('\n');

  test('keeps only shots with xG, reads final score and GEND', () => {
    const g = parseGameCsv(csv);
    assert.equal(g.shots.length, 2);
    assert.deepEqual(g.shots.map(s => [s.team, s.xg, s.sequence]), [['HOME', 0.1, '1'], ['AWAY', 0.3, '3']]);
    assert.equal(g.ended, true);
    assert.equal(g.awayGoals, 1);
  });

  test('a game in progress is not ended', () => {
    assert.equal(parseGameCsv(csv.split('\n').slice(0, 4).join('\n')).ended, false);
  });

  test('missing columns throw', () => {
    assert.throws(() => parseGameCsv('time,team\n1,HOME'));
  });
});

describe('simulateHomeWinShare', () => {
  test('certain goals decide it', () => {
    assert.equal(simulateHomeWinShare([shot({ team: 'HOME', xg: 1 }, '1')], 100), 1);
    assert.equal(simulateHomeWinShare([shot({ team: 'AWAY', xg: 1 }, '1')], 100), 0);
    assert.equal(simulateHomeWinShare([], 100), 0.5); // all ties
  });

  test('only one goal per sequence (rebounds)', () => {
    const shots = [shot({ team: 'HOME', xg: 1 }, '7'), shot({ team: 'HOME', xg: 1 }, '7'), shot({ team: 'AWAY', xg: 1 }, '8'), shot({ team: 'AWAY', xg: 1 }, '9')];
    assert.equal(simulateHomeWinShare(shots, 50), 0);
  });

  test('empty-net goals only count when the shooter leads by 1 or 2', () => {
    // Tied game: an empty-netter would not have happened
    assert.equal(simulateHomeWinShare([shot({ team: 'HOME', xg: 1, emptyNet: true }, '1')], 50), 0.5);
    // Up one: it counts
    const upOne = [shot({ team: 'HOME', xg: 1 }, '1'), shot({ team: 'AWAY', xg: 1, emptyNet: true }, '2')];
    assert.equal(simulateHomeWinShare(upOne, 50), 1);
  });

  test('matches the probability for a single coin-flip shot', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const share = simulateHomeWinShare([shot({ team: 'HOME', xg: 0.3 }, '1')], 20000, rng);
    // home scores 30% (win), else tie (half): 0.3 + 0.7 * 0.5 = 0.65
    assert.ok(Math.abs(share - 0.65) < 0.02, `got ${share}`);
  });
});

describe('buildMeterSvg', () => {
  test('shows both percentages and the final score', () => {
    const svg = buildMeterSvg({ awayAbbrev: 'UTA', homeAbbrev: 'SEA', awayScore: 3, homeScore: 5, homeShare: 0.37, teamCode: 'UTA' });
    assert.match(svg, />63%</);
    assert.match(svg, />37%</);
    assert.match(svg, /UTA 3 – 5 SEA · FINAL</);
    assert.match(svg, /UTA DESERVED TO WIN/);
    // our side in Mountain Blue, the opponent's share in white
    assert.match(svg, /fill="#6cace4">63%</);
    assert.match(svg, /fill="#ffffff">37%</);
  });
});
