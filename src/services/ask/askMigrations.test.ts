import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ASK_NICKNAMES_SCHEMA, ASK_PRESET_TEXT_FIXES, fixSeededAskPresets, type SqlDb } from '../../db/askMigrations.js';
import { STARTER_PRESETS } from './presets.js';

// better-sqlite3 may not be built on a dev machine; node:sqlite has the same prepare/run/exec shape.

const ASK_PRESETS_DDL = `
  CREATE TABLE ask_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, trigger TEXT NOT NULL, response TEXT NOT NULL,
    exact_only INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL
  );`;

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(ASK_PRESETS_DDL);
  return db;
}

describe('walrus → woolly mammoth preset migration', () => {
  test('every new string is in the starter set and no old one is', () => {
    const responses = new Set(STARTER_PRESETS.flatMap(p => p.responses));
    for (const [oldText, newText] of ASK_PRESET_TEXT_FIXES) {
      assert.match(oldText, /walrus/);
      assert.doesNotMatch(newText, /walrus/i);
      assert.ok(responses.has(newText), newText);
      assert.ok(!responses.has(oldText), oldText);
    }
  });

  test('rewrites exactly the seeded rows, leaves admin rows alone, and is idempotent', () => {
    const db = freshDb();
    const insert = db.prepare('INSERT INTO ask_presets (guild_id, trigger, response, exact_only, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?)');
    // Production: 7 triggers × each of the 2 walrus responses = 14 rows
    for (const [oldText] of ASK_PRESET_TEXT_FIXES) for (let i = 0; i < 7; i++) insert.run('g1', `trigger ${i}`, oldText, null, 'now');
    insert.run('g1', 'custom', 'I am a walrus and I stand by it.', 'admin', 'now');
    insert.run('g1', 'other', 'Tusks up.', null, 'now');

    assert.equal(fixSeededAskPresets(db as unknown as SqlDb), 14);
    assert.equal(fixSeededAskPresets(db as unknown as SqlDb), 0);

    const rows = db.prepare('SELECT response FROM ask_presets ORDER BY id').all() as { response: string }[];
    const walrus = rows.filter(r => /walrus/.test(r.response)).map(r => r.response);
    assert.deepEqual(walrus, ['I am a walrus and I stand by it.']);
    assert.equal(rows.filter(r => r.response === 'Fair. I am a woolly mammoth with a Wi-Fi connection.').length, 7);
    assert.equal(rows.filter(r => r.response === 'I am a bot. A mammoth-shaped one.').length, 7);
  });

  test('nickname schema creates idempotently with one row per (guild, nickname)', () => {
    const db = freshDb();
    db.exec(ASK_NICKNAMES_SCHEMA);
    db.exec(ASK_NICKNAMES_SCHEMA);
    const insert = db.prepare('INSERT INTO ask_nicknames (guild_id, nickname, nickname_key, player, created_at) VALUES (?, ?, ?, ?, ?)');
    insert.run('g1', 'Cools', 'cools', 'Logan Cooley', 'now');
    insert.run('g2', 'Cools', 'cools', 'Logan Cooley', 'now');
    assert.throws(() => insert.run('g1', 'COOLS', 'cools', 'Someone Else', 'now'), /UNIQUE/);
  });
});
