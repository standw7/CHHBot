import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gifAccess, logLine } from './gifLog.js';
import type { GifCommand } from '../db/models.js';

describe('gifAccess', () => {
  const config = { gif_contributor_role_id: '111' };

  test('Manage Server is admin regardless of roles', () => {
    assert.equal(gifAccess(true, [], config), 'admin');
    assert.equal(gifAccess(true, ['111'], null), 'admin');
  });

  test('contributor role grants contributor', () => {
    assert.equal(gifAccess(false, ['999', '111'], config), 'contributor');
  });

  test('no role, or no role configured, is denied', () => {
    assert.equal(gifAccess(false, ['999'], config), null);
    assert.equal(gifAccess(false, ['111'], { gif_contributor_role_id: null }), null);
    assert.equal(gifAccess(false, ['111'], undefined), null);
  });
});

describe('logLine', () => {
  const entry: GifCommand = { id: 1, guild_id: 'g', key: 'goal', url: 'https://tenor.com/x', added_by: 'u', created_at: '', file_path: null };

  test('describes each action', () => {
    assert.equal(logLine('42', { kind: 'add', entry }), '➕ <@42> added to **goal**');
    assert.equal(logLine('42', { kind: 'remove', entries: [entry] }), '🗑️ <@42> removed from **goal**');
    assert.equal(logLine('42', { kind: 'delete', key: 'goal', entries: [entry, entry] }), '💥 <@42> deleted key **goal** (2 items)');
    assert.equal(logLine('42', { kind: 'rename', oldKey: 'a', newKey: 'b', count: 3 }), '✏️ <@42> renamed **a** → **b** (3 items)');
  });
});
