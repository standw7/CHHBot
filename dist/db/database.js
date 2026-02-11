"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.closeDb = closeDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
let db;
function getDb() {
    if (!db) {
        const dbPath = process.env.DATABASE_PATH || path_1.default.join(process.cwd(), 'tusky.db');
        db = new better_sqlite3_1.default(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        runMigrations(db);
    }
    return db;
}
function closeDb() {
    if (db) {
        db.close();
    }
}
function runMigrations(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      primary_team TEXT DEFAULT 'UTA',
      gameday_channel_id TEXT,
      hof_channel_id TEXT,
      bot_commands_channel_id TEXT,
      news_channel_id TEXT,
      spoiler_delay_seconds INTEGER DEFAULT 30,
      spoiler_mode TEXT DEFAULT 'off',
      command_mode TEXT DEFAULT 'slash_plus_prefix',
      link_fix_enabled INTEGER DEFAULT 1,
      timezone TEXT DEFAULT 'America/Denver'
    );

    CREATE TABLE IF NOT EXISTS gif_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      key TEXT,
      url TEXT,
      added_by TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS posted_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      game_id INTEGER,
      event_id INTEGER,
      posted_at TEXT,
      UNIQUE(guild_id, game_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS posted_finals (
      guild_id TEXT,
      game_id INTEGER,
      posted_at TEXT,
      PRIMARY KEY(guild_id, game_id)
    );

    CREATE TABLE IF NOT EXISTS hof_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      original_message_id TEXT,
      original_channel_id TEXT,
      inducted_at TEXT,
      UNIQUE(guild_id, original_message_id)
    );

    CREATE TABLE IF NOT EXISTS feed_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      url TEXT,
      label TEXT,
      last_item_id TEXT,
      added_by TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS posted_game_starts (
      guild_id TEXT,
      game_id INTEGER,
      posted_at TEXT,
      PRIMARY KEY(guild_id, game_id)
    );

    CREATE INDEX IF NOT EXISTS idx_gif_commands_guild_key ON gif_commands(guild_id, key);
    CREATE INDEX IF NOT EXISTS idx_posted_goals_game ON posted_goals(guild_id, game_id);
    CREATE INDEX IF NOT EXISTS idx_feed_sources_guild ON feed_sources(guild_id);
  `);
    // Migrations for existing databases
    const columns = db.prepare("PRAGMA table_info(guild_config)").all();
    const colNames = columns.map(c => c.name);
    if (!colNames.includes('news_channel_id')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN news_channel_id TEXT');
    }
    if (!colNames.includes('link_fix_enabled')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN link_fix_enabled INTEGER DEFAULT 1');
    }
    if (!colNames.includes('gameday_role_id')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN gameday_role_id TEXT');
    }
    if (!colNames.includes('hof_threshold')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN hof_threshold INTEGER DEFAULT 8');
    }
}
//# sourceMappingURL=database.js.map