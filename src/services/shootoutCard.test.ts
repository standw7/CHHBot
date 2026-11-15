import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shootoutState, buildShootoutCard, goalsFor, isDecided } from './shootoutCard.js';
import type { ShootoutAttempt } from './shootoutCard.js';
import type { PlayByPlayResponse } from '../nhl/types.js';

// STL @ UTA, 2026-11-12: 0-0 after OT, STL won the shootout 3-2 in round 8
const pbp = JSON.parse(readFileSync(new URL('./fixtures/shootout-2026020307.json', import.meta.url), 'utf8')) as PlayByPlayResponse;

function upTo(attempts: number, gameState = 'LIVE'): PlayByPlayResponse {
  const result: PlayByPlayResponse['plays'] = [];
  let n = 0;
  for (const p of pbp.plays) {
    const isAttempt = ['goal', 'shot-on-goal', 'missed-shot'].includes(p.typeDescKey);
    if (isAttempt && n === attempts) break;
    if (p.typeDescKey === 'shootout-complete' && n === attempts && gameState === 'LIVE') break;
    if (isAttempt) n++;
    result.push(p);
  }
  return { ...pbp, gameState, plays: gameState === 'LIVE' ? result.filter(p => p.typeDescKey !== 'shootout-complete') : result };
}

describe('shootoutState', () => {
  test('reads every attempt with shooter, team and result', () => {
    const state = shootoutState(pbp)!;
    assert.equal(state.attempts.length, 16);
    assert.deepEqual(state.attempts[0], { eventId: state.attempts[0].eventId, teamAbbrev: 'UTA', shooter: 'Trocheck', result: 'goal', shotType: 'wrist', missReason: undefined });
    assert.equal(state.attempts[2].result, 'miss');
    assert.equal(state.attempts[2].missReason, 'hit post');
    assert.equal(state.attempts[4].result, 'save');
    assert.equal(state.complete, true);
    assert.equal(goalsFor(state, 'STL'), 3);
    assert.equal(goalsFor(state, 'UTA'), 2);
  });

  test('no shootout plays → null', () => {
    assert.equal(shootoutState({ ...pbp, plays: [] }), null);
  });
});

// Alternating shots, A first: 'g' = goal, 's' = save
function seq(shots: string): ShootoutAttempt[] {
  return [...shots].map((r, i) => ({
    eventId: i, teamAbbrev: i % 2 === 0 ? 'A' : 'H', shooter: 'X', result: r === 'g' ? 'goal' : 'save',
  }));
}

describe('isDecided', () => {
  test('out of reach inside the first 3 rounds', () => {
    assert.equal(isDecided(seq('gsgs'), 'A', 'H'), true); // 2-0, H has 1 shot left
    assert.equal(isDecided(seq('gsg'), 'A', 'H'), false); // 2-0, H still has 2
    assert.equal(isDecided(seq('ggsg'), 'A', 'H'), false); // 1-2, A has 1 left
    assert.equal(isDecided(seq('ggsgs'), 'A', 'H'), true); // 1-2, A out of shots... H leads after A's 3rd
  });

  test('sudden death only ends after an even round', () => {
    assert.equal(isDecided(seq('ssssssg'), 'A', 'H'), false);
    assert.equal(isDecided(seq('ssssssgs'), 'A', 'H'), true);
    assert.equal(isDecided(seq('ssssssgg'), 'A', 'H'), false);
  });

  test('real game: decided only on the last attempt', () => {
    const all = shootoutState(pbp)!.attempts;
    assert.equal(isDecided(all.slice(0, 15), 'STL', 'UTA'), false);
    assert.equal(isDecided(all, 'STL', 'UTA'), true);
  });
});

describe('buildShootoutCard', () => {
  test('mid-shootout: marks so far, empty boxes for the rest of the 3 rounds, no result', () => {
    const embed = buildShootoutCard(shootoutState(upTo(3))!, 'off', 'UTA').toJSON();
    const [awayRow, homeRow] = embed.description!.split('\n');
    assert.equal(awayRow, 'STL **STL**  ✅ ⬜ ⬜');
    assert.equal(homeRow, 'UTA **UTA**  ✅ ❌ ⬜');
    assert.ok(!embed.description!.includes('win the shootout'));
    assert.match(embed.description!, /\*\*Round 1\*\*\nUTA Trocheck ✅ \*wrist\*\nSTL Neighbours ✅ \*backhand\*/);
  });

  test('sudden death rounds are labeled and extend the rows', () => {
    const embed = buildShootoutCard(shootoutState(upTo(8))!, 'off', 'UTA').toJSON();
    assert.ok(embed.description!.includes('**Round 4 · sudden death**'));
    assert.equal(embed.description!.split('\n')[1], 'UTA **UTA**  ✅ ❌ ❌ ❌');
  });

  test('final: winner line, loss color for the primary team', () => {
    const embed = buildShootoutCard(shootoutState(pbp)!, 'off', 'UTA').toJSON();
    assert.ok(embed.description!.includes('**Blues** win the shootout 3–2'));
    assert.equal(embed.color, 0x8B0000);
  });

  test('spoiler mode wraps the result and keeps a neutral color', () => {
    const embed = buildShootoutCard(shootoutState(pbp)!, 'wrap_scores', 'UTA').toJSON();
    assert.match(embed.description!, /\|\|🏆 .* win the shootout 3–2\|\|/);
    assert.equal(embed.color, 0x006847);
  });
});
