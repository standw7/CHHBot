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
      timezone TEXT DEFAULT 'America/Denver',
      daily_card_enabled INTEGER DEFAULT 1,
      daily_card_hour INTEGER DEFAULT 9,
      season_start TEXT DEFAULT '2026-09-29',
      season_end TEXT DEFAULT '2027-04-10'
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

    CREATE TABLE IF NOT EXISTS player_follows (
      user_id TEXT,
      player_id INTEGER,
      player_name TEXT,
      created_at TEXT,
      PRIMARY KEY(user_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS member_follows (
      guild_id TEXT,
      follower_id TEXT,
      target_id TEXT,
      created_at TEXT,
      PRIMARY KEY(guild_id, follower_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS follow_opt_outs (
      guild_id TEXT,
      user_id TEXT,
      PRIMARY KEY(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS follow_dms_sent (
      user_id TEXT,
      game_id INTEGER,
      event_id INTEGER,
      PRIMARY KEY(user_id, game_id, event_id)
    );

    -- xG-victim shots already rolled (posted or not), so a restart never re-rolls one
    CREATE TABLE IF NOT EXISTS xg_shots_rolled (
      guild_id TEXT,
      game_id INTEGER,
      shot_id TEXT,
      PRIMARY KEY(guild_id, game_id, shot_id)
    );

    DROP TABLE IF EXISTS rewards_pings;
    CREATE TABLE IF NOT EXISTS rewards_schedule (
      guild_id TEXT,
      game_id INTEGER,
      anchor_at INTEGER,
      last_slot INTEGER,
      PRIMARY KEY(guild_id, game_id)
    );

    CREATE INDEX IF NOT EXISTS idx_gif_commands_guild_key ON gif_commands(guild_id, key);
    CREATE INDEX IF NOT EXISTS idx_posted_goals_game ON posted_goals(guild_id, game_id);
    CREATE INDEX IF NOT EXISTS idx_feed_sources_guild ON feed_sources(guild_id);

    CREATE TABLE IF NOT EXISTS posted_feed_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      feed_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      UNIQUE(guild_id, feed_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_posted_feed_items_lookup ON posted_feed_items(guild_id, feed_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_posted_feed_items_age ON posted_feed_items(posted_at);

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      fire_at TEXT NOT NULL,
      dm INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_fire_at ON reminders(fire_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(guild_id, user_id);

    CREATE TABLE IF NOT EXISTS hsc_posts_seen (
      post_uri TEXT PRIMARY KEY,
      seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rewards_daily_posted (
      guild_id TEXT,
      date TEXT,
      PRIMARY KEY (guild_id, date)
    );

    CREATE TABLE IF NOT EXISTS daily_cards_posted (
      guild_id TEXT,
      date TEXT,
      PRIMARY KEY (guild_id, date)
    );
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
    if (!colNames.includes('rewards_role_id')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN rewards_role_id TEXT');
    }
    if (!colNames.includes('rewards_channel_id')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN rewards_channel_id TEXT');
    }
    if (!colNames.includes('hsc_charts_enabled')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN hsc_charts_enabled INTEGER DEFAULT 0');
    }
    if (!colNames.includes('hof_threshold')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN hof_threshold INTEGER DEFAULT 8');
    }
    if (!colNames.includes('daily_card_enabled')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN daily_card_enabled INTEGER DEFAULT 1');
    }
    if (!colNames.includes('daily_card_hour')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN daily_card_hour INTEGER DEFAULT 9');
    }
    if (!colNames.includes('season_start')) {
        db.exec("ALTER TABLE guild_config ADD COLUMN season_start TEXT DEFAULT '2026-09-29'");
    }
    if (!colNames.includes('season_end')) {
        db.exec("ALTER TABLE guild_config ADD COLUMN season_end TEXT DEFAULT '2027-04-10'");
    }
    if (!colNames.includes('gif_contributor_role_id')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN gif_contributor_role_id TEXT');
    }
    if (!colNames.includes('gif_log_channel_id')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN gif_log_channel_id TEXT');
    }
    if (!colNames.includes('tomato_channel_id')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN tomato_channel_id TEXT');
    }
    if (!colNames.includes('tomato_threshold')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN tomato_threshold INTEGER DEFAULT 8');
    }
    if (!colNames.includes('ask_enabled')) {
        db.exec('ALTER TABLE guild_config ADD COLUMN ask_enabled INTEGER DEFAULT 1');
    }
    // Ask Tusky: preset trigger → response pairs (several rows per trigger = random pick),
    // a marker so the starter set is seeded once per guild, and a log of every ask
    // (feeds !ask misses and the daily LLM caps, so restarts don't reset them).
    db.exec(`
    CREATE TABLE IF NOT EXISTS ask_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      response TEXT NOT NULL,
      exact_only INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ask_presets_guild ON ask_presets(guild_id);

    CREATE TABLE IF NOT EXISTS ask_presets_seeded (
      guild_id TEXT PRIMARY KEY,
      seeded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ask_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      day TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      user_id TEXT NOT NULL,
      question TEXT NOT NULL,
      tier TEXT NOT NULL,
      answer TEXT,
      llm_used INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      reply_message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ask_log_guild_day ON ask_log(guild_id, day);
    CREATE INDEX IF NOT EXISTS idx_ask_log_user_day ON ask_log(user_id, day);
    CREATE INDEX IF NOT EXISTS idx_ask_log_reply ON ask_log(reply_message_id);
  `);
    // Reaction boards other than the Hall of Fame (e.g. 'tomato'); one post per board per message
    db.exec(`
    CREATE TABLE IF NOT EXISTS board_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      original_message_id TEXT NOT NULL,
      original_channel_id TEXT,
      board_message_id TEXT,
      inducted_at TEXT,
      UNIQUE(board, guild_id, original_message_id)
    );
  `);
    // Saved copies of linked files for gif commands
    const gifColumns = db.prepare("PRAGMA table_info(gif_commands)").all();
    if (!gifColumns.some(c => c.name === 'file_path')) {
        db.exec('ALTER TABLE gif_commands ADD COLUMN file_path TEXT');
    }
    // Check hof_messages columns for HoF message tracking
    const hofColumns = db.prepare("PRAGMA table_info(hof_messages)").all();
    const hofColNames = hofColumns.map(c => c.name);
    if (!hofColNames.includes('hof_message_id')) {
        db.exec('ALTER TABLE hof_messages ADD COLUMN hof_message_id TEXT');
    }
    if (!hofColNames.includes('hof_channel_id')) {
        db.exec('ALTER TABLE hof_messages ADD COLUMN hof_channel_id TEXT');
    }
    if (!hofColNames.includes('hof_followup_id')) {
        db.exec('ALTER TABLE hof_messages ADD COLUMN hof_followup_id TEXT');
    }
    // Second follow-up: links from the message the inducted post replied to
    if (!hofColNames.includes('hof_reply_followup_id')) {
        db.exec('ALTER TABLE hof_messages ADD COLUMN hof_reply_followup_id TEXT');
    }
}
//# sourceMappingURL=database.js.map