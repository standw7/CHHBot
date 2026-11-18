export interface SqlDb {
    exec(sql: string): unknown;
    prepare(sql: string): {
        run(...params: unknown[]): {
            changes: number | bigint;
        };
    };
}
/**
 * Starter preset responses that shipped calling Tusky a walrus (Tusky is a woolly mammoth,
 * the team mascot). Old text → new text, frozen here: these are the exact strings seeded
 * into ask_presets, so rows an admin added or edited are never touched.
 */
export declare const ASK_PRESET_TEXT_FIXES: readonly (readonly [string, string])[];
/** Rewrites seeded preset responses that match an old string exactly. Idempotent; returns rows changed. */
export declare function fixSeededAskPresets(db: SqlDb): number;
/** Player nicknames per guild (nickname_key = normalized nickname), seeded once like ask_presets. */
export declare const ASK_NICKNAMES_SCHEMA = "\n  CREATE TABLE IF NOT EXISTS ask_nicknames (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    guild_id TEXT NOT NULL,\n    nickname TEXT NOT NULL,\n    nickname_key TEXT NOT NULL,\n    player TEXT NOT NULL,\n    created_by TEXT,\n    created_at TEXT NOT NULL,\n    UNIQUE(guild_id, nickname_key)\n  );\n\n  CREATE TABLE IF NOT EXISTS ask_nicknames_seeded (\n    guild_id TEXT PRIMARY KEY,\n    seeded_at TEXT NOT NULL\n  );\n";
//# sourceMappingURL=askMigrations.d.ts.map