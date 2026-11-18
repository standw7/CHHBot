import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { askDay, checkCaps, Cooldown, todayLong } from './guards.js';

describe('Cooldown', () => {
  test('blocks the same user for 5 seconds, not others', () => {
    const c = new Cooldown(5000);
    assert.equal(c.tryAcquire('a', 1000), true);
    assert.equal(c.tryAcquire('a', 5999), false);
    assert.equal(c.tryAcquire('b', 5999), true);
    assert.equal(c.tryAcquire('a', 6000), true);
  });
  test('ignored attempts do not extend the cooldown', () => {
    const c = new Cooldown(5000);
    c.tryAcquire('a', 0);
    c.tryAcquire('a', 4000);
    assert.equal(c.tryAcquire('a', 5000), true);
  });
  test('prune drops expired entries', () => {
    const c = new Cooldown(5000);
    c.tryAcquire('a', 0);
    c.tryAcquire('b', 4000);
    c.prune(6000);
    assert.equal(c.size, 1);
  });
});

describe('checkCaps', () => {
  const limits = { user: 20, guild: 300 };
  test('under both caps', () => assert.deepEqual(checkCaps({ user: 19, guild: 299 }, limits), { ok: true }));
  test('user cap', () => assert.deepEqual(checkCaps({ user: 20, guild: 5 }, limits), { ok: false, scope: 'user' }));
  test('guild cap wins over user cap', () => assert.deepEqual(checkCaps({ user: 25, guild: 300 }, limits), { ok: false, scope: 'guild' }));
  test('cap of 0 disables', () => assert.deepEqual(checkCaps({ user: 0, guild: 0 }, { user: 0, guild: 10 }), { ok: false, scope: 'user' }));
});

describe('days in America/Denver', () => {
  test('cap day rolls over at Denver midnight, not UTC', () => {
    assert.equal(askDay(new Date('2026-11-18T05:30:00Z')), '2026-11-17'); // 22:30 MST
    assert.equal(askDay(new Date('2026-11-18T07:30:00Z')), '2026-11-18');
  });
  test('long date', () => {
    assert.equal(todayLong(new Date('2026-11-17T18:00:00Z')), 'Tuesday, November 17, 2026');
  });
});
