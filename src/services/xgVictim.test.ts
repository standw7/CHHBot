import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseVictimShots, postChance, goalsOwed, debtPaymentLabel, pickQuip, clockText, buildXgCard, QUIPS,
  type VictimShot,
} from './xgVictim.js';

// Real MoneyPuck rows from SJS @ UTA, 2026-11-14 (a shot on goal, a miss, a goal, an opponent's miss, Hayton faceoffs)
const csv = readFileSync(new URL('./fixtures/moneypuck-2026020323.csv', import.meta.url), 'utf8');

describe('parseVictimShots', () => {
  test('shot on goal', () => {
    const [s] = parseVictimShots(csv, 'UTA', 'Yamamoto');
    assert.equal(s.event, 'SHOT');
    assert.equal(s.sweaterNumber, 56);
    assert.equal(s.shotType, 'Slap');
    assert.equal(s.missReason, undefined);
    assert.equal(s.gameSeconds, 236);
    assert.ok(Math.abs(s.xg - 0.08) < 0.005);
  });

  test('miss keeps the reason', () => {
    const [s] = parseVictimShots(csv, 'UTA', 'Keller');
    assert.equal(s.event, 'MISS');
    assert.equal(s.missReason, 'Above Crossbar');
  });

  test('goal with a season count after the name', () => {
    const [s] = parseVictimShots(csv, 'UTA', 'Jones');
    assert.equal(s.event, 'GOAL');
    assert.equal(s.shotType, 'Tip-In');
  });

  test('other team and non-shot events are ignored', () => {
    assert.deepEqual(parseVictimShots(csv, 'UTA', 'Orlov'), []);
    assert.deepEqual(parseVictimShots(csv, 'UTA', 'Hayton'), []); // only faceoffs/giveaways so far
  });
});

describe('postChance', () => {
  test('weighted by xG, capped at 1', () => {
    assert.ok(Math.abs(postChance(0.03) - 0.1) < 1e-9);
    assert.ok(Math.abs(postChance(0.15) - 0.5) < 1e-9);
    assert.equal(postChance(0.30), 1);
    assert.equal(postChance(0.6), 1);
    assert.equal(postChance(0), 0);
  });
});

describe('debt', () => {
  test('owed = expected - actual', () => {
    assert.ok(Math.abs(goalsOwed({ xg: 4.37, goals: 2 }, 0.5, 0) - 2.87) < 1e-9);
  });

  test('payment banner', () => {
    assert.equal(debtPaymentLabel(1.37), '💸 DEBT PAYMENT — Hayton now owes 1.4 goals');
    assert.equal(debtPaymentLabel(0.96), '💸 DEBT PAYMENT — Hayton now owes 1.0 goal');
    assert.equal(debtPaymentLabel(-0.4), '💸 DEBT PAYMENT — Hayton is PAID IN FULL (0.4 goals ahead of the model)');
    assert.equal(debtPaymentLabel(undefined), '💸 DEBT PAYMENT');
  });
});

describe('card text', () => {
  test('quips fill in the percentage', () => {
    assert.equal(pickQuip(0.31, () => 0), 'This one was a 31% chance to be a goal. It was not.');
    assert.equal(pickQuip(0.31, () => 0.999), QUIPS[QUIPS.length - 1]);
  });

  test('clock', () => {
    assert.equal(clockText(236, 2), '16:04 left in the 1st');
    assert.equal(clockText(1200 + 948, 2), '4:12 left in the 2nd');
    assert.equal(clockText(3600 + 210, 2), '1:30 left in OT');
    assert.equal(clockText(3600 + 1200 + 60, 3), '19:00 left in OT2');
  });

  test('the card', () => {
    const shot: VictimShot = { id: '90', gameSeconds: 2148, event: 'SHOT', xg: 0.31, sweaterNumber: 27, shotType: 'Wrist' };
    const earlier: VictimShot[] = [
      { id: '20', gameSeconds: 300, event: 'MISS', xg: 0.12, missReason: 'Wide Left' },
      { id: '50', gameSeconds: 900, event: 'SHOT', xg: 0.31 },
    ];
    const embed = buildXgCard({
      shot, tonight: [...earlier, shot], season: { xg: 5.36, goals: 2 }, gameType: 2,
      quip: 'This one was a 31% chance to be a goal. It was not.',
    }).toJSON();
    assert.equal(embed.title, '🥶 Barrett Hayton Expected Goal 🥶');
    assert.equal(embed.description, [
      '#27 Barrett Hayton (0.31 xG) wrist — saved',
      'This one was a 31% chance to be a goal. It was not.',
      '',
      '**Tonight:** 3 attempts · 0.74 xG · 0 goals',
      '**Season:** 6.1 xG · 2 goals · Hayton owes the people 4.1 goals',
      '',
      '🥶 4:12 left in the 2nd',
    ].join('\n'));
  });

  test('miss reason replaces "saved"; no season line in the playoffs', () => {
    const shot: VictimShot = { id: '1', gameSeconds: 100, event: 'MISS', xg: 0.2, sweaterNumber: 27, shotType: 'Snap', missReason: 'Hit Crossbar' };
    const desc = buildXgCard({ shot, tonight: [shot], gameType: 3, quip: 'q' }).toJSON().description!;
    assert.ok(desc.startsWith('#27 Barrett Hayton (0.20 xG) snap — hit crossbar'));
    assert.ok(!desc.includes('Season'));
  });
});
