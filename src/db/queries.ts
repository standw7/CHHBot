import { getDb } from './database.js';
import type { GuildConfig, GifCommand, PostedGoal, HofMessage, FeedSource } from './models.js';

// --- Guild Config ---

export function getGuildConfig(guildId: string): GuildConfig | undefined {
  return getDb().prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) as GuildConfig | undefined;
}

export function upsertGuildConfig(guildId: string, updates: Partial<Omit<GuildConfig, 'guild_id'>>): void {
  const existing = getGuildConfig(guildId);
  if (!existing) {
    getDb().prepare(`
      INSERT INTO guild_config (guild_id, primary_team, gameday_channel_id, hof_channel_id, bot_commands_channel_id, news_channel_id, gameday_role_id, spoiler_delay_seconds, spoiler_mode, command_mode, link_fix_enabled, timezone, hof_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      updates.primary_team ?? 'UTA',
      updates.gameday_channel_id ?? null,
      updates.hof_channel_id ?? null,
      updates.bot_commands_channel_id ?? null,
      updates.news_channel_id ?? null,
      updates.gameday_role_id ?? null,
      updates.spoiler_delay_seconds ?? 30,
      updates.spoiler_mode ?? 'off',
      updates.command_mode ?? 'slash_plus_prefix',
      updates.link_fix_enabled ?? 1,
      updates.timezone ?? 'America/Denver',
      updates.hof_threshold ?? 8
    );
  } else {
    const fields = Object.keys(updates) as (keyof typeof updates)[];
    if (fields.length === 0) return;
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    getDb().prepare(`UPDATE guild_config SET ${setClause} WHERE guild_id = ?`).run(...values, guildId);
  }
}

// --- Gif Commands ---

export function getGifUrls(guildId: string, key: string): string[] {
  const rows = getDb().prepare('SELECT url FROM gif_commands WHERE guild_id = ? AND key = ?').all(guildId, key) as { url: string }[];
  return rows.map(r => r.url);
}

export function addGifUrl(guildId: string, key: string, url: string, addedBy: string): void {
  getDb().prepare(`
    INSERT INTO gif_commands (guild_id, key, url, added_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, key, url, addedBy, new Date().toISOString());
}

export function removeGifUrl(guildId: string, key: string, url: string): boolean {
  const result = getDb().prepare('DELETE FROM gif_commands WHERE guild_id = ? AND key = ? AND url = ?').run(guildId, key, url);
  return result.changes > 0;
}

export function listGifKeys(guildId: string): string[] {
  const rows = getDb().prepare('SELECT DISTINCT key FROM gif_commands WHERE guild_id = ? ORDER BY key').all(guildId) as { key: string }[];
  return rows.map(r => r.key);
}

export function deleteGifKey(guildId: string, key: string): number {
  const result = getDb().prepare('DELETE FROM gif_commands WHERE guild_id = ? AND key = ?').run(guildId, key);
  return result.changes;
}

export function renameGifKey(guildId: string, oldKey: string, newKey: string): number {
  const result = getDb().prepare('UPDATE gif_commands SET key = ? WHERE guild_id = ? AND key = ?').run(newKey, guildId, oldKey);
  return result.changes;
}

export function listGifUrlsForKey(guildId: string, key: string): GifCommand[] {
  return getDb().prepare('SELECT * FROM gif_commands WHERE guild_id = ? AND key = ?').all(guildId, key) as GifCommand[];
}

// --- Posted Goals ---

export function hasGoalBeenPosted(guildId: string, gameId: number, eventId: number): boolean {
  const row = getDb().prepare('SELECT 1 FROM posted_goals WHERE guild_id = ? AND game_id = ? AND event_id = ?').get(guildId, gameId, eventId);
  return !!row;
}

export function markGoalPosted(guildId: string, gameId: number, eventId: number): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO posted_goals (guild_id, game_id, event_id, posted_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, gameId, eventId, new Date().toISOString());
}

export function getPostedGoalIds(guildId: string, gameId: number): number[] {
  const rows = getDb().prepare('SELECT event_id FROM posted_goals WHERE guild_id = ? AND game_id = ?').all(guildId, gameId) as { event_id: number }[];
  return rows.map(r => r.event_id);
}

// --- Posted Finals ---

export function hasFinalBeenPosted(guildId: string, gameId: number): boolean {
  const row = getDb().prepare('SELECT 1 FROM posted_finals WHERE guild_id = ? AND game_id = ?').get(guildId, gameId);
  return !!row;
}

export function markFinalPosted(guildId: string, gameId: number): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO posted_finals (guild_id, game_id, posted_at)
    VALUES (?, ?, ?)
  `).run(guildId, gameId, new Date().toISOString());
}

// --- Hall of Fame ---

export function hasMessageBeenInducted(guildId: string, messageId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM hof_messages WHERE guild_id = ? AND original_message_id = ?').get(guildId, messageId);
  return !!row;
}

export function markMessageInducted(guildId: string, messageId: string, channelId: string): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO hof_messages (guild_id, original_message_id, original_channel_id, inducted_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, messageId, channelId, new Date().toISOString());
}

// --- Feed Sources ---

export function getFeedSources(guildId: string): FeedSource[] {
  return getDb().prepare('SELECT * FROM feed_sources WHERE guild_id = ? ORDER BY label').all(guildId) as FeedSource[];
}

export function addFeedSource(guildId: string, url: string, label: string, addedBy: string): void {
  getDb().prepare(`
    INSERT INTO feed_sources (guild_id, url, label, last_item_id, added_by, created_at)
    VALUES (?, ?, ?, NULL, ?, ?)
  `).run(guildId, url, label, addedBy, new Date().toISOString());
}

export function removeFeedSource(guildId: string, idOrLabel: string): boolean {
  // Try by ID first, then by label
  let result = getDb().prepare('DELETE FROM feed_sources WHERE guild_id = ? AND id = ?').run(guildId, idOrLabel);
  if (result.changes === 0) {
    result = getDb().prepare('DELETE FROM feed_sources WHERE guild_id = ? AND label = ?').run(guildId, idOrLabel);
  }
  return result.changes > 0;
}

export function updateFeedLastItem(feedId: number, lastItemId: string): void {
  getDb().prepare('UPDATE feed_sources SET last_item_id = ? WHERE id = ?').run(lastItemId, feedId);
}

export function resetFeedLastItem(guildId: string, label: string): boolean {
  const result = getDb().prepare('UPDATE feed_sources SET last_item_id = NULL WHERE guild_id = ? AND label = ?').run(guildId, label);
  return result.changes > 0;
}

// --- Posted Game Starts ---

export function hasGameStartBeenPosted(guildId: string, gameId: number): boolean {
  const row = getDb().prepare('SELECT 1 FROM posted_game_starts WHERE guild_id = ? AND game_id = ?').get(guildId, gameId);
  return !!row;
}

export function markGameStartPosted(guildId: string, gameId: number): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO posted_game_starts (guild_id, game_id, posted_at)
    VALUES (?, ?, ?)
  `).run(guildId, gameId, new Date().toISOString());
}

export function resetGameStart(guildId: string, gameId: number): void {
  getDb().prepare('DELETE FROM posted_game_starts WHERE guild_id = ? AND game_id = ?').run(guildId, gameId);
}
