import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { coreQuestion, formatStatAnswer, parseIntent, playerNameCandidates } from './intents.js';
import { normalizeText } from './text.js';
import type { PlayerSeasonStats } from '../../nhl/types.js';

const intent = (q: string) => parseIntent(normalizeText(q));

describe('parseIntent', () => {
  test('next game', () => {
    for (const q of [
      'when is the next game?', "When's the next game", 'what time is the game tonight', 'when do we play next',
      'who do we play next?', 'next game', 'hey tusky when does the mammoth play', 'is there a game tonight',
      'who are we playing tonight', 'what time is puck drop',
    ]) assert.deepEqual(intent(q), { kind: 'next_game' }, q);
  });

  test('standings, with filters', () => {
    assert.deepEqual(intent('standings'), { kind: 'standings' });
    assert.deepEqual(intent('where are we in the standings?'), { kind: 'standings' });
    assert.deepEqual(intent('where do we stand right now'), { kind: 'standings' });
    assert.deepEqual(intent('what place are we in'), { kind: 'standings' });
    assert.deepEqual(intent('league standings'), { kind: 'standings', filter: 'league' });
    assert.deepEqual(intent('show me the east standings'), { kind: 'standings', filter: 'east' });
  });

  test('last game', () => {
    for (const q of [
      'what was the score of the last game', 'did we win?', 'did we win last night', 'who won last night',
      'last game score', 'how did we do', "what's the final score of the last game",
    ]) assert.deepEqual(intent(q), { kind: 'last_game' }, q);
  });

  test('player stats', () => {
    assert.deepEqual(intent('How many goals does Cooley have?'), { kind: 'player_stats', player: 'cooley', stat: 'goals' });
    assert.deepEqual(intent('how many points has clayton keller got this season'), { kind: 'player_stats', player: 'clayton keller', stat: 'points' });
    assert.deepEqual(intent('how many wins does vejmelka have'), { kind: 'player_stats', player: 'vejmelka', stat: 'wins' });
    assert.deepEqual(intent("Cooley's stats"), { kind: 'player_stats', player: 'cooleys' });
    assert.deepEqual(intent('stats for guenther'), { kind: 'player_stats', player: 'guenther' });
    assert.deepEqual(intent('how is schmaltz doing this season'), { kind: 'player_stats', player: 'schmaltz' });
  });

  test('podcast', () => {
    assert.deepEqual(intent("what's the newest episode?"), { kind: 'latest_episode' });
    assert.deepEqual(intent('latest clean hits episode'), { kind: 'latest_episode' });
    assert.deepEqual(intent('is there a new episode out yet'), { kind: 'latest_episode' });
    assert.deepEqual(intent('did clean hits drop'), { kind: 'latest_episode' });
    assert.deepEqual(intent('latest substack post'), { kind: 'latest_substack' });
    assert.deepEqual(intent('newest clean hits article'), { kind: 'latest_substack' });
  });

  test('not confident → null (falls through to the LLM)', () => {
    for (const q of [
      'when is the next game against colorado and who is starting in goal',
      'how many goals does the team have',
      'team stats',
      'how is the power play doing compared to last year when we had a different coach',
      'what do you think about the trade deadline',
      'who won the stanley cup in 1994',
      'standings are fake',
      'did we win the trade',
      '',
    ]) assert.equal(intent(q), null, q);
  });

  test('coreQuestion strips filler at the ends only', () => {
    assert.equal(coreQuestion('hey tusky when is the next game please'), 'when is the next game');
    assert.equal(coreQuestion('so who won'), 'who won');
  });

  test('playerNameCandidates handles possessives', () => {
    assert.deepEqual(playerNameCandidates('cooleys'), ['cooleys', 'cooley']);
    assert.deepEqual(playerNameCandidates('keller'), ['keller']);
  });
});

describe('formatStatAnswer', () => {
  const skater = { gamesPlayed: 20, goals: 12, assists: 1, points: 13, plusMinus: -3, pim: 4, powerPlayGoals: 1, shots: 50 } as PlayerSeasonStats;
  test('skater counting stats', () => {
    assert.equal(formatStatAnswer('Logan Cooley', 'C', skater, 'goals', '2026-27 Season'), 'Logan Cooley has 12 goals in 20 games (2026-27).');
    assert.equal(formatStatAnswer('Logan Cooley', 'C', skater, 'assists', '2026-27 Season'), 'Logan Cooley has 1 assist in 20 games (2026-27).');
    assert.equal(formatStatAnswer('Logan Cooley', 'C', skater, 'plusMinus', '2026-27 Season'), 'Logan Cooley is -3 in 20 games (2026-27).');
  });
  test('position mismatch or missing data → null', () => {
    assert.equal(formatStatAnswer('Logan Cooley', 'C', skater, 'wins', '2026-27 Season'), null);
    assert.equal(formatStatAnswer('Karel Vejmelka', 'G', { gamesPlayed: 10, wins: 6 } as PlayerSeasonStats, 'goals', 'Season'), null);
    assert.equal(formatStatAnswer('X', 'C', undefined, 'goals', 'Season'), null);
  });
  test('goalie wins', () => {
    assert.equal(formatStatAnswer('Karel Vejmelka', 'G', { gamesPlayed: 10, wins: 6 } as PlayerSeasonStats, 'wins', '2026-27 Season'), 'Karel Vejmelka has 6 wins in 10 games (2026-27).');
  });
});
