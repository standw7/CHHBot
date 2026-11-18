// Ask Tusky data migrations, kept apart from database.ts so they can be tested against any
// SQLite driver with the better-sqlite3 prepare/run/exec shape (tests use node:sqlite).

export interface SqlDb {
  exec(sql: string): unknown;
  prepare(sql: string): { run(...params: unknown[]): { changes: number | bigint } };
}

/**
 * Starter preset responses that shipped calling Tusky a walrus (Tusky is a woolly mammoth,
 * the team mascot). Old text → new text, frozen here: these are the exact strings seeded
 * into ask_presets, so rows an admin added or edited are never touched.
 */
export const ASK_PRESET_TEXT_FIXES: readonly (readonly [string, string])[] = [
  ['Fair. I am a walrus with a Wi-Fi connection.', 'Fair. I am a woolly mammoth with a Wi-Fi connection.'],
  ['I am a bot. A walrus-shaped one.', 'I am a bot. A mammoth-shaped one.'],
];

/** Rewrites seeded preset responses that match an old string exactly. Idempotent; returns rows changed. */
export function fixSeededAskPresets(db: SqlDb): number {
  const update = db.prepare('UPDATE ask_presets SET response = ? WHERE response = ?');
  let changed = 0;
  for (const [oldText, newText] of ASK_PRESET_TEXT_FIXES) changed += Number(update.run(newText, oldText).changes);
  return changed;
}

/** Player nicknames per guild (nickname_key = normalized nickname), seeded once like ask_presets. */
export const ASK_NICKNAMES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ask_nicknames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    nickname_key TEXT NOT NULL,
    player TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(guild_id, nickname_key)
  );

  CREATE TABLE IF NOT EXISTS ask_nicknames_seeded (
    guild_id TEXT PRIMARY KEY,
    seeded_at TEXT NOT NULL
  );
`;
