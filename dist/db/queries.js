"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGuildConfig = getGuildConfig;
exports.upsertGuildConfig = upsertGuildConfig;
exports.getGifUrls = getGifUrls;
exports.addGifUrl = addGifUrl;
exports.removeGifUrl = removeGifUrl;
exports.listGifKeys = listGifKeys;
exports.listGifUrlsForKey = listGifUrlsForKey;
exports.hasGoalBeenPosted = hasGoalBeenPosted;
exports.markGoalPosted = markGoalPosted;
exports.getPostedGoalIds = getPostedGoalIds;
exports.hasFinalBeenPosted = hasFinalBeenPosted;
exports.markFinalPosted = markFinalPosted;
exports.hasMessageBeenInducted = hasMessageBeenInducted;
exports.markMessageInducted = markMessageInducted;
exports.getFeedSources = getFeedSources;
exports.addFeedSource = addFeedSource;
exports.removeFeedSource = removeFeedSource;
exports.updateFeedLastItem = updateFeedLastItem;
exports.hasGameStartBeenPosted = hasGameStartBeenPosted;
exports.markGameStartPosted = markGameStartPosted;
exports.resetGameStart = resetGameStart;
const database_js_1 = require("./database.js");
// --- Guild Config ---
function getGuildConfig(guildId) {
    return (0, database_js_1.getDb)().prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
}
function upsertGuildConfig(guildId, updates) {
    const existing = getGuildConfig(guildId);
    if (!existing) {
        (0, database_js_1.getDb)().prepare(`
      INSERT INTO guild_config (guild_id, primary_team, gameday_channel_id, hof_channel_id, bot_commands_channel_id, news_channel_id, gameday_role_id, spoiler_delay_seconds, spoiler_mode, command_mode, link_fix_enabled, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, updates.primary_team ?? 'UTA', updates.gameday_channel_id ?? null, updates.hof_channel_id ?? null, updates.bot_commands_channel_id ?? null, updates.news_channel_id ?? null, updates.gameday_role_id ?? null, updates.spoiler_delay_seconds ?? 30, updates.spoiler_mode ?? 'off', updates.command_mode ?? 'slash_plus_prefix', updates.link_fix_enabled ?? 1, updates.timezone ?? 'America/Denver');
    }
    else {
        const fields = Object.keys(updates);
        if (fields.length === 0)
            return;
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => updates[f]);
        (0, database_js_1.getDb)().prepare(`UPDATE guild_config SET ${setClause} WHERE guild_id = ?`).run(...values, guildId);
    }
}
// --- Gif Commands ---
function getGifUrls(guildId, key) {
    const rows = (0, database_js_1.getDb)().prepare('SELECT url FROM gif_commands WHERE guild_id = ? AND key = ?').all(guildId, key);
    return rows.map(r => r.url);
}
function addGifUrl(guildId, key, url, addedBy) {
    (0, database_js_1.getDb)().prepare(`
    INSERT INTO gif_commands (guild_id, key, url, added_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, key, url, addedBy, new Date().toISOString());
}
function removeGifUrl(guildId, key, url) {
    const result = (0, database_js_1.getDb)().prepare('DELETE FROM gif_commands WHERE guild_id = ? AND key = ? AND url = ?').run(guildId, key, url);
    return result.changes > 0;
}
function listGifKeys(guildId) {
    const rows = (0, database_js_1.getDb)().prepare('SELECT DISTINCT key FROM gif_commands WHERE guild_id = ? ORDER BY key').all(guildId);
    return rows.map(r => r.key);
}
function listGifUrlsForKey(guildId, key) {
    return (0, database_js_1.getDb)().prepare('SELECT * FROM gif_commands WHERE guild_id = ? AND key = ?').all(guildId, key);
}
// --- Posted Goals ---
function hasGoalBeenPosted(guildId, gameId, eventId) {
    const row = (0, database_js_1.getDb)().prepare('SELECT 1 FROM posted_goals WHERE guild_id = ? AND game_id = ? AND event_id = ?').get(guildId, gameId, eventId);
    return !!row;
}
function markGoalPosted(guildId, gameId, eventId) {
    (0, database_js_1.getDb)().prepare(`
    INSERT OR IGNORE INTO posted_goals (guild_id, game_id, event_id, posted_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, gameId, eventId, new Date().toISOString());
}
function getPostedGoalIds(guildId, gameId) {
    const rows = (0, database_js_1.getDb)().prepare('SELECT event_id FROM posted_goals WHERE guild_id = ? AND game_id = ?').all(guildId, gameId);
    return rows.map(r => r.event_id);
}
// --- Posted Finals ---
function hasFinalBeenPosted(guildId, gameId) {
    const row = (0, database_js_1.getDb)().prepare('SELECT 1 FROM posted_finals WHERE guild_id = ? AND game_id = ?').get(guildId, gameId);
    return !!row;
}
function markFinalPosted(guildId, gameId) {
    (0, database_js_1.getDb)().prepare(`
    INSERT OR IGNORE INTO posted_finals (guild_id, game_id, posted_at)
    VALUES (?, ?, ?)
  `).run(guildId, gameId, new Date().toISOString());
}
// --- Hall of Fame ---
function hasMessageBeenInducted(guildId, messageId) {
    const row = (0, database_js_1.getDb)().prepare('SELECT 1 FROM hof_messages WHERE guild_id = ? AND original_message_id = ?').get(guildId, messageId);
    return !!row;
}
function markMessageInducted(guildId, messageId, channelId) {
    (0, database_js_1.getDb)().prepare(`
    INSERT OR IGNORE INTO hof_messages (guild_id, original_message_id, original_channel_id, inducted_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, messageId, channelId, new Date().toISOString());
}
// --- Feed Sources ---
function getFeedSources(guildId) {
    return (0, database_js_1.getDb)().prepare('SELECT * FROM feed_sources WHERE guild_id = ? ORDER BY label').all(guildId);
}
function addFeedSource(guildId, url, label, addedBy) {
    (0, database_js_1.getDb)().prepare(`
    INSERT INTO feed_sources (guild_id, url, label, last_item_id, added_by, created_at)
    VALUES (?, ?, ?, NULL, ?, ?)
  `).run(guildId, url, label, addedBy, new Date().toISOString());
}
function removeFeedSource(guildId, idOrLabel) {
    // Try by ID first, then by label
    let result = (0, database_js_1.getDb)().prepare('DELETE FROM feed_sources WHERE guild_id = ? AND id = ?').run(guildId, idOrLabel);
    if (result.changes === 0) {
        result = (0, database_js_1.getDb)().prepare('DELETE FROM feed_sources WHERE guild_id = ? AND label = ?').run(guildId, idOrLabel);
    }
    return result.changes > 0;
}
function updateFeedLastItem(feedId, lastItemId) {
    (0, database_js_1.getDb)().prepare('UPDATE feed_sources SET last_item_id = ? WHERE id = ?').run(lastItemId, feedId);
}
// --- Posted Game Starts ---
function hasGameStartBeenPosted(guildId, gameId) {
    const row = (0, database_js_1.getDb)().prepare('SELECT 1 FROM posted_game_starts WHERE guild_id = ? AND game_id = ?').get(guildId, gameId);
    return !!row;
}
function markGameStartPosted(guildId, gameId) {
    (0, database_js_1.getDb)().prepare(`
    INSERT OR IGNORE INTO posted_game_starts (guild_id, game_id, posted_at)
    VALUES (?, ?, ?)
  `).run(guildId, gameId, new Date().toISOString());
}
function resetGameStart(guildId, gameId) {
    (0, database_js_1.getDb)().prepare('DELETE FROM posted_game_starts WHERE guild_id = ? AND game_id = ?').run(guildId, gameId);
}
//# sourceMappingURL=queries.js.map