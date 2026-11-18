import { getDb } from './database.js';
import type { GuildConfig, GifCommand, PostedGoal, HofMessage, FeedSource, Reminder, AskPreset, AskLogEntry, AskTier, AskNickname } from './models.js';
import { DEFAULT_SEASON_START, DEFAULT_SEASON_END } from '../services/dailyCard.js';

// --- Guild Config ---

export function getGuildConfig(guildId: string): GuildConfig | undefined {
  return getDb().prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) as GuildConfig | undefined;
}

export function upsertGuildConfig(guildId: string, updates: Partial<Omit<GuildConfig, 'guild_id'>>): void {
  const existing = getGuildConfig(guildId);
  if (!existing) {
    getDb().prepare(`
      INSERT INTO guild_config (guild_id, primary_team, gameday_channel_id, hof_channel_id, bot_commands_channel_id, news_channel_id, gameday_role_id, spoiler_delay_seconds, spoiler_mode, command_mode, link_fix_enabled, timezone, hof_threshold, daily_card_enabled, daily_card_hour, season_start, season_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      updates.hof_threshold ?? 8,
      updates.daily_card_enabled ?? 1,
      updates.daily_card_hour ?? 9,
      updates.season_start ?? DEFAULT_SEASON_START,
      updates.season_end ?? DEFAULT_SEASON_END
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

export function getGifEntries(guildId: string, key: string): { url: string; file_path: string | null }[] {
  return getDb().prepare('SELECT url, file_path FROM gif_commands WHERE guild_id = ? AND key = ?').all(guildId, key) as { url: string; file_path: string | null }[];
}

export function addGifUrl(guildId: string, key: string, url: string, addedBy: string, filePath: string | null = null): GifCommand {
  const createdAt = new Date().toISOString();
  const { lastInsertRowid } = getDb().prepare(`
    INSERT INTO gif_commands (guild_id, key, url, added_by, created_at, file_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, key, url, addedBy, createdAt, filePath);
  return { id: Number(lastInsertRowid), guild_id: guildId, key, url, added_by: addedBy, created_at: createdAt, file_path: filePath };
}

/** Removes matching entries and returns them (callers delete their saved files). */
export function removeGifUrl(guildId: string, key: string, url: string): GifCommand[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM gif_commands WHERE guild_id = ? AND key = ? AND url = ? ORDER BY id').all(guildId, key, url) as GifCommand[];
  db.prepare('DELETE FROM gif_commands WHERE guild_id = ? AND key = ? AND url = ?').run(guildId, key, url);
  return rows;
}

export function setGifFilePath(id: number, filePath: string): void {
  getDb().prepare('UPDATE gif_commands SET file_path = ? WHERE id = ?').run(filePath, id);
}

export function deleteGifEntryById(id: number): void {
  getDb().prepare('DELETE FROM gif_commands WHERE id = ?').run(id);
}

/** All gif entries across guilds (for the one-off media backfill). */
export function listAllGifEntries(): { id: number; guild_id: string; key: string; url: string; file_path: string | null }[] {
  return getDb().prepare('SELECT id, guild_id, key, url, file_path FROM gif_commands ORDER BY id').all() as { id: number; guild_id: string; key: string; url: string; file_path: string | null }[];
}

export function listGifKeys(guildId: string): string[] {
  const rows = getDb().prepare('SELECT DISTINCT key FROM gif_commands WHERE guild_id = ? ORDER BY key').all(guildId) as { key: string }[];
  return rows.map(r => r.key);
}

/** Every gif key in the guild with how many items it holds (for Ask Tusky's list_gif_commands tool). */
export function listGifKeyCounts(guildId: string): { key: string; count: number }[] {
  return getDb().prepare('SELECT key, COUNT(*) AS count FROM gif_commands WHERE guild_id = ? GROUP BY key ORDER BY key').all(guildId) as { key: string; count: number }[];
}

/** Removes every entry for a key and returns them (callers delete their saved files). */
export function deleteGifKey(guildId: string, key: string): GifCommand[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM gif_commands WHERE guild_id = ? AND key = ? ORDER BY id').all(guildId, key) as GifCommand[];
  db.prepare('DELETE FROM gif_commands WHERE guild_id = ? AND key = ?').run(guildId, key);
  return rows;
}

export function renameGifKey(guildId: string, oldKey: string, newKey: string): number {
  const result = getDb().prepare('UPDATE gif_commands SET key = ? WHERE guild_id = ? AND key = ?').run(newKey, guildId, oldKey);
  return result.changes;
}

export function listGifUrlsForKey(guildId: string, key: string): GifCommand[] {
  return getDb().prepare('SELECT * FROM gif_commands WHERE guild_id = ? AND key = ? ORDER BY id').all(guildId, key) as GifCommand[];
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

export function markMessageInducted(guildId: string, messageId: string, channelId: string, hofMessageId?: string, hofChannelId?: string): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO hof_messages (guild_id, original_message_id, original_channel_id, hof_message_id, hof_channel_id, inducted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, messageId, channelId, hofMessageId ?? null, hofChannelId ?? null, new Date().toISOString());
}

export function getHofEntry(guildId: string, messageId: string): HofMessage | undefined {
  return getDb().prepare('SELECT * FROM hof_messages WHERE guild_id = ? AND original_message_id = ?').get(guildId, messageId) as HofMessage | undefined;
}

export function getAllHofMessages(guildId: string): HofMessage[] {
  return getDb().prepare(
    'SELECT * FROM hof_messages WHERE guild_id = ? AND hof_message_id IS NOT NULL ORDER BY inducted_at ASC'
  ).all(guildId) as HofMessage[];
}

export function updateHofMessageIds(guildId: string, originalMessageId: string, hofMessageId: string, hofFollowupId: string | null, hofReplyFollowupId: string | null = null): void {
  getDb().prepare(
    'UPDATE hof_messages SET hof_message_id = ?, hof_followup_id = ?, hof_reply_followup_id = ? WHERE guild_id = ? AND original_message_id = ?'
  ).run(hofMessageId, hofFollowupId, hofReplyFollowupId, guildId, originalMessageId);
}

export function updateHofFollowup(guildId: string, originalMessageId: string, followupId: string | null, replyFollowupId: string | null = null): void {
  getDb().prepare(
    'UPDATE hof_messages SET hof_followup_id = ?, hof_reply_followup_id = ? WHERE guild_id = ? AND original_message_id = ?'
  ).run(followupId, replyFollowupId, guildId, originalMessageId);
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

export function getRewardsSchedule(guildId: string, gameId: number): { anchorAt: number; lastSlot: number } | null {
  const row = getDb().prepare('SELECT anchor_at, last_slot FROM rewards_schedule WHERE guild_id = ? AND game_id = ?').get(guildId, gameId) as { anchor_at: number; last_slot: number } | undefined;
  return row ? { anchorAt: row.anchor_at, lastSlot: row.last_slot } : null;
}

export function saveRewardsSchedule(guildId: string, gameId: number, schedule: { anchorAt: number; lastSlot: number }): void {
  getDb().prepare(`
    INSERT INTO rewards_schedule (guild_id, game_id, anchor_at, last_slot)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, game_id) DO UPDATE SET anchor_at = excluded.anchor_at, last_slot = excluded.last_slot
  `).run(guildId, gameId, schedule.anchorAt, schedule.lastSlot);
}

export function addFollow(userId: string, playerId: number, playerName: string): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO player_follows (user_id, player_id, player_name, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, playerId, playerName, new Date().toISOString());
}

export function removeFollow(userId: string, playerId: number): boolean {
  return getDb().prepare('DELETE FROM player_follows WHERE user_id = ? AND player_id = ?').run(userId, playerId).changes > 0;
}

export function listFollows(userId: string): { playerId: number; playerName: string }[] {
  const rows = getDb().prepare('SELECT player_id, player_name FROM player_follows WHERE user_id = ? ORDER BY created_at').all(userId) as { player_id: number; player_name: string }[];
  return rows.map(r => ({ playerId: r.player_id, playerName: r.player_name }));
}

/** userId → set of followed playerIds, for users following any of `playerIds`. */
export function getFollowersOf(playerIds: number[]): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  if (playerIds.length === 0) return result;
  const placeholders = playerIds.map(() => '?').join(', ');
  const rows = getDb().prepare(`SELECT user_id, player_id FROM player_follows WHERE player_id IN (${placeholders})`).all(...playerIds) as { user_id: string; player_id: number }[];
  for (const r of rows) {
    if (!result.has(r.user_id)) result.set(r.user_id, new Set());
    result.get(r.user_id)!.add(r.player_id);
  }
  return result;
}

/** Claims the one roll for an xG-victim shot. False if it was already rolled. */
export function claimXgShot(guildId: string, gameId: number, shotId: string): boolean {
  return getDb().prepare('INSERT OR IGNORE INTO xg_shots_rolled (guild_id, game_id, shot_id) VALUES (?, ?, ?)').run(guildId, gameId, shotId).changes > 0;
}

/** Claims the DM for this user + goal. False if another tracker already sent it. */
export function claimFollowDm(userId: string, gameId: number, eventId: number): boolean {
  return getDb().prepare('INSERT OR IGNORE INTO follow_dms_sent (user_id, game_id, event_id) VALUES (?, ?, ?)').run(userId, gameId, eventId).changes > 0;
}

export function addMemberFollow(guildId: string, followerId: string, targetId: string): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO member_follows (guild_id, follower_id, target_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, followerId, targetId, new Date().toISOString());
}

export function removeMemberFollow(guildId: string, followerId: string, targetId: string): boolean {
  return getDb().prepare('DELETE FROM member_follows WHERE guild_id = ? AND follower_id = ? AND target_id = ?').run(guildId, followerId, targetId).changes > 0;
}

/** Members this user follows in this guild (user IDs). */
export function listMemberFollows(guildId: string, followerId: string): string[] {
  const rows = getDb().prepare('SELECT target_id FROM member_follows WHERE guild_id = ? AND follower_id = ? ORDER BY created_at').all(guildId, followerId) as { target_id: string }[];
  return rows.map(r => r.target_id);
}

/** Users following this member in this guild (user IDs). */
export function getMemberFollowers(guildId: string, targetId: string): string[] {
  const rows = getDb().prepare('SELECT follower_id FROM member_follows WHERE guild_id = ? AND target_id = ? ORDER BY created_at').all(guildId, targetId) as { follower_id: string }[];
  return rows.map(r => r.follower_id);
}

export function isFollowOptedOut(guildId: string, userId: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM follow_opt_outs WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

/** Opting out also removes everyone currently following this member. */
export function setFollowOptOut(guildId: string, userId: string, optedOut: boolean): void {
  const db = getDb();
  if (optedOut) {
    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO follow_opt_outs (guild_id, user_id) VALUES (?, ?)').run(guildId, userId);
      db.prepare('DELETE FROM member_follows WHERE guild_id = ? AND target_id = ?').run(guildId, userId);
    })();
  } else {
    db.prepare('DELETE FROM follow_opt_outs WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }
}

export function resetGameStart(guildId: string, gameId: number): void {
  getDb().prepare('DELETE FROM posted_game_starts WHERE guild_id = ? AND game_id = ?').run(guildId, gameId);
}

// --- Posted Feed Items (dedup) ---

export function hasFeedItemBeenPosted(guildId: string, feedId: number, itemId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM posted_feed_items WHERE guild_id = ? AND feed_id = ? AND item_id = ?').get(guildId, feedId, itemId);
  return !!row;
}

export function markFeedItemPosted(guildId: string, feedId: number, itemId: string): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO posted_feed_items (guild_id, feed_id, item_id, posted_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, feedId, itemId, new Date().toISOString());
}

export function cleanupOldFeedItems(daysOld: number = 30): number {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb().prepare('DELETE FROM posted_feed_items WHERE posted_at < ?').run(cutoff);
  return result.changes;
}

// --- Daily Cards Posted (dedup) ---

export function hasDailyCardBeenPosted(guildId: string, date: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM daily_cards_posted WHERE guild_id = ? AND date = ?').get(guildId, date);
  return !!row;
}

/** Returns true if this call claimed the (guild, date) pair; false if it was already claimed. */
export function markDailyCardPosted(guildId: string, date: string): boolean {
  const info = getDb().prepare(`
    INSERT OR IGNORE INTO daily_cards_posted (guild_id, date)
    VALUES (?, ?)
  `).run(guildId, date);
  return info.changes > 0;
}

export function hasDailyCheckInBeenPosted(guildId: string, date: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM rewards_daily_posted WHERE guild_id = ? AND date = ?').get(guildId, date);
}

/** Returns true if this call claimed the (guild, date) pair; false if it was already claimed. */
export function markDailyCheckInPosted(guildId: string, date: string): boolean {
  return getDb().prepare('INSERT OR IGNORE INTO rewards_daily_posted (guild_id, date) VALUES (?, ?)').run(guildId, date).changes > 0;
}

export function hasAnyHscPostSeen(): boolean {
  return !!getDb().prepare('SELECT 1 FROM hsc_posts_seen LIMIT 1').get();
}

export function isHscPostSeen(uri: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM hsc_posts_seen WHERE post_uri = ?').get(uri);
}

/** Claims a Bluesky post; false if it was already seen/posted. */
export function markHscPostSeen(uri: string): boolean {
  return getDb().prepare('INSERT OR IGNORE INTO hsc_posts_seen (post_uri, seen_at) VALUES (?, ?)').run(uri, new Date().toISOString()).changes > 0;
}

// --- Reminders ---

export function createReminder(guildId: string, channelId: string, userId: string, message: string, fireAt: string, dm: boolean): number {
  const result = getDb().prepare(`
    INSERT INTO reminders (guild_id, channel_id, user_id, message, fire_at, dm, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, channelId, userId, message, fireAt, dm ? 1 : 0, new Date().toISOString());
  return result.lastInsertRowid as number;
}

export function getDueReminders(): Reminder[] {
  return getDb().prepare(
    'SELECT * FROM reminders WHERE fire_at <= ?'
  ).all(new Date().toISOString()) as Reminder[];
}

export function getUserReminders(guildId: string, userId: string): Reminder[] {
  return getDb().prepare(
    'SELECT * FROM reminders WHERE guild_id = ? AND user_id = ? ORDER BY fire_at ASC'
  ).all(guildId, userId) as Reminder[];
}

export function cancelReminder(id: number, userId: string): boolean {
  const result = getDb().prepare(
    'DELETE FROM reminders WHERE id = ? AND user_id = ?'
  ).run(id, userId);
  return result.changes > 0;
}

export function deleteReminder(id: number): void {
  getDb().prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

export function countUserReminders(guildId: string, userId: string): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as count FROM reminders WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId) as { count: number };
  return row.count;
}

// --- Reaction boards (Tomato Town) ---

export function hasBoardPost(board: string, guildId: string, messageId: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM board_messages WHERE board = ? AND guild_id = ? AND original_message_id = ?').get(board, guildId, messageId);
}

/** Claims the slot before posting; false if another reaction event already did (no double posts). */
export function claimBoardPost(board: string, guildId: string, messageId: string, channelId: string): boolean {
  return getDb().prepare(`
    INSERT OR IGNORE INTO board_messages (board, guild_id, original_message_id, original_channel_id, inducted_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(board, guildId, messageId, channelId, new Date().toISOString()).changes > 0;
}

export function setBoardMessageId(board: string, guildId: string, messageId: string, boardMessageId: string): void {
  getDb().prepare('UPDATE board_messages SET board_message_id = ? WHERE board = ? AND guild_id = ? AND original_message_id = ?').run(boardMessageId, board, guildId, messageId);
}

export function releaseBoardPost(board: string, guildId: string, messageId: string): void {
  getDb().prepare('DELETE FROM board_messages WHERE board = ? AND guild_id = ? AND original_message_id = ?').run(board, guildId, messageId);
}

export function getBoardMessageId(board: string, guildId: string, messageId: string): string | null {
  const row = getDb().prepare('SELECT board_message_id FROM board_messages WHERE board = ? AND guild_id = ? AND original_message_id = ?')
    .get(board, guildId, messageId) as { board_message_id: string | null } | undefined;
  return row?.board_message_id ?? null;
}

export interface BoardPostRow {
  original_message_id: string;
  original_channel_id: string | null;
  board_message_id: string;
}

/** Posted board entries (board message exists), newest first. */
export function getBoardPosts(board: string, guildId: string): BoardPostRow[] {
  return getDb().prepare(
    'SELECT original_message_id, original_channel_id, board_message_id FROM board_messages WHERE board = ? AND guild_id = ? AND board_message_id IS NOT NULL ORDER BY inducted_at DESC'
  ).all(board, guildId) as BoardPostRow[];
}

// --- Ask Tusky ---

export function getAskPresets(guildId: string): AskPreset[] {
  return getDb().prepare('SELECT * FROM ask_presets WHERE guild_id = ? ORDER BY trigger, id').all(guildId) as AskPreset[];
}

export function addAskPreset(guildId: string, trigger: string, response: string, exactOnly: boolean, createdBy: string | null): number {
  const { lastInsertRowid } = getDb().prepare(`
    INSERT INTO ask_presets (guild_id, trigger, response, exact_only, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, trigger, response, exactOnly ? 1 : 0, createdBy, new Date().toISOString());
  return Number(lastInsertRowid);
}

export function removeAskPreset(guildId: string, id: number): boolean {
  return getDb().prepare('DELETE FROM ask_presets WHERE guild_id = ? AND id = ?').run(guildId, id).changes > 0;
}

/**
 * Seeds the starter presets the first time a guild is seen. Marked in ask_presets_seeded,
 * so a guild that later removes every preset doesn't get them back.
 */
export function seedAskPresetsOnce(guildId: string, presets: { trigger: string; response: string; exactOnly: boolean }[]): boolean {
  const db = getDb();
  return db.transaction(() => {
    const already = db.prepare('SELECT 1 FROM ask_presets_seeded WHERE guild_id = ?').get(guildId);
    if (already) return false;
    const now = new Date().toISOString();
    db.prepare('INSERT INTO ask_presets_seeded (guild_id, seeded_at) VALUES (?, ?)').run(guildId, now);
    const hasAny = db.prepare('SELECT 1 FROM ask_presets WHERE guild_id = ? LIMIT 1').get(guildId);
    if (hasAny) return false;
    const insert = db.prepare(`
      INSERT INTO ask_presets (guild_id, trigger, response, exact_only, created_by, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `);
    for (const p of presets) insert.run(guildId, p.trigger, p.response, p.exactOnly ? 1 : 0, now);
    return true;
  })();
}

export function logAsk(entry: {
  guildId: string; channelId: string | null; userId: string; day: string; question: string;
  tier: AskTier; answer: string | null; llmUsed: boolean; inputTokens: number; outputTokens: number;
}): number {
  const { lastInsertRowid } = getDb().prepare(`
    INSERT INTO ask_log (created_at, day, guild_id, channel_id, user_id, question, tier, answer, llm_used, input_tokens, output_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(new Date().toISOString(), entry.day, entry.guildId, entry.channelId, entry.userId, entry.question,
    entry.tier, entry.answer, entry.llmUsed ? 1 : 0, entry.inputTokens, entry.outputTokens);
  return Number(lastInsertRowid);
}

export function setAskReplyMessageId(logId: number, replyMessageId: string): void {
  getDb().prepare('UPDATE ask_log SET reply_message_id = ? WHERE id = ?').run(replyMessageId, logId);
}

/** True if `messageId` is one of Tusky's Ask answers (replying to it continues the conversation). */
export function isAskReply(messageId: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM ask_log WHERE reply_message_id = ? LIMIT 1').get(messageId);
}

/** LLM calls made today (America/Denver day) by a user (across guilds) and by a guild. */
export function countAskLlmUsage(guildId: string, userId: string, day: string): { user: number; guild: number } {
  const db = getDb();
  const user = db.prepare('SELECT COUNT(*) AS n FROM ask_log WHERE user_id = ? AND day = ? AND llm_used = 1').get(userId, day) as { n: number };
  const guild = db.prepare('SELECT COUNT(*) AS n FROM ask_log WHERE guild_id = ? AND day = ? AND llm_used = 1').get(guildId, day) as { n: number };
  return { user: user.n, guild: guild.n };
}

/** Recent questions that went to the LLM or were deflected — candidates for new presets. */
export function getAskMisses(guildId: string, limit: number): AskLogEntry[] {
  return getDb().prepare(`
    SELECT * FROM ask_log WHERE guild_id = ? AND tier IN ('llm', 'deflect')
    ORDER BY id DESC LIMIT ?
  `).all(guildId, limit) as AskLogEntry[];
}

// --- Ask Tusky: player nicknames ---

/** Stable order (player, then nickname) so the LLM system prompt built from it stays cacheable. */
export function getAskNicknames(guildId: string): AskNickname[] {
  return getDb().prepare('SELECT * FROM ask_nicknames WHERE guild_id = ? ORDER BY player, nickname_key, id').all(guildId) as AskNickname[];
}

/** Adds a nickname; returns the new id, or the existing row when the nickname is already taken. */
export function addAskNickname(
  guildId: string, nickname: string, nicknameKey: string, player: string, createdBy: string | null,
): { ok: true; id: number } | { ok: false; existing: AskNickname } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM ask_nicknames WHERE guild_id = ? AND nickname_key = ?').get(guildId, nicknameKey) as AskNickname | undefined;
  if (existing) return { ok: false, existing };
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO ask_nicknames (guild_id, nickname, nickname_key, player, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, nickname, nicknameKey, player, createdBy, new Date().toISOString());
  return { ok: true, id: Number(lastInsertRowid) };
}

export function removeAskNicknameById(guildId: string, id: number): AskNickname | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ask_nicknames WHERE guild_id = ? AND id = ?').get(guildId, id) as AskNickname | undefined;
  if (!row) return null;
  db.prepare('DELETE FROM ask_nicknames WHERE id = ?').run(row.id);
  return row;
}

export function removeAskNicknameByKey(guildId: string, nicknameKey: string): AskNickname | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ask_nicknames WHERE guild_id = ? AND nickname_key = ?').get(guildId, nicknameKey) as AskNickname | undefined;
  if (!row) return null;
  db.prepare('DELETE FROM ask_nicknames WHERE id = ?').run(row.id);
  return row;
}

/**
 * Seeds the starter nicknames the first time a guild is seen (same rules as seedAskPresetsOnce:
 * marked in ask_nicknames_seeded, so removing them all doesn't bring them back).
 */
export function seedAskNicknamesOnce(guildId: string, nicknames: { nickname: string; key: string; player: string }[]): boolean {
  const db = getDb();
  return db.transaction(() => {
    const already = db.prepare('SELECT 1 FROM ask_nicknames_seeded WHERE guild_id = ?').get(guildId);
    if (already) return false;
    const now = new Date().toISOString();
    db.prepare('INSERT INTO ask_nicknames_seeded (guild_id, seeded_at) VALUES (?, ?)').run(guildId, now);
    const hasAny = db.prepare('SELECT 1 FROM ask_nicknames WHERE guild_id = ? LIMIT 1').get(guildId);
    if (hasAny) return false;
    const insert = db.prepare(`
      INSERT OR IGNORE INTO ask_nicknames (guild_id, nickname, nickname_key, player, created_by, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `);
    for (const n of nicknames) insert.run(guildId, n.nickname, n.key, n.player, now);
    return true;
  })();
}
