import type { GuildConfig, GifCommand, HofMessage, FeedSource, Reminder, AskPreset, AskLogEntry, AskTier } from './models.js';
export declare function getGuildConfig(guildId: string): GuildConfig | undefined;
export declare function upsertGuildConfig(guildId: string, updates: Partial<Omit<GuildConfig, 'guild_id'>>): void;
export declare function getGifEntries(guildId: string, key: string): {
    url: string;
    file_path: string | null;
}[];
export declare function addGifUrl(guildId: string, key: string, url: string, addedBy: string, filePath?: string | null): GifCommand;
/** Removes matching entries and returns them (callers delete their saved files). */
export declare function removeGifUrl(guildId: string, key: string, url: string): GifCommand[];
export declare function setGifFilePath(id: number, filePath: string): void;
export declare function deleteGifEntryById(id: number): void;
/** All gif entries across guilds (for the one-off media backfill). */
export declare function listAllGifEntries(): {
    id: number;
    guild_id: string;
    key: string;
    url: string;
    file_path: string | null;
}[];
export declare function listGifKeys(guildId: string): string[];
/** Removes every entry for a key and returns them (callers delete their saved files). */
export declare function deleteGifKey(guildId: string, key: string): GifCommand[];
export declare function renameGifKey(guildId: string, oldKey: string, newKey: string): number;
export declare function listGifUrlsForKey(guildId: string, key: string): GifCommand[];
export declare function hasGoalBeenPosted(guildId: string, gameId: number, eventId: number): boolean;
export declare function markGoalPosted(guildId: string, gameId: number, eventId: number): void;
export declare function getPostedGoalIds(guildId: string, gameId: number): number[];
export declare function hasFinalBeenPosted(guildId: string, gameId: number): boolean;
export declare function markFinalPosted(guildId: string, gameId: number): void;
export declare function hasMessageBeenInducted(guildId: string, messageId: string): boolean;
export declare function markMessageInducted(guildId: string, messageId: string, channelId: string, hofMessageId?: string, hofChannelId?: string): void;
export declare function getHofEntry(guildId: string, messageId: string): HofMessage | undefined;
export declare function getAllHofMessages(guildId: string): HofMessage[];
export declare function updateHofMessageIds(guildId: string, originalMessageId: string, hofMessageId: string, hofFollowupId: string | null, hofReplyFollowupId?: string | null): void;
export declare function updateHofFollowup(guildId: string, originalMessageId: string, followupId: string | null, replyFollowupId?: string | null): void;
export declare function getFeedSources(guildId: string): FeedSource[];
export declare function addFeedSource(guildId: string, url: string, label: string, addedBy: string): void;
export declare function removeFeedSource(guildId: string, idOrLabel: string): boolean;
export declare function updateFeedLastItem(feedId: number, lastItemId: string): void;
export declare function resetFeedLastItem(guildId: string, label: string): boolean;
export declare function hasGameStartBeenPosted(guildId: string, gameId: number): boolean;
export declare function markGameStartPosted(guildId: string, gameId: number): void;
export declare function getRewardsSchedule(guildId: string, gameId: number): {
    anchorAt: number;
    lastSlot: number;
} | null;
export declare function saveRewardsSchedule(guildId: string, gameId: number, schedule: {
    anchorAt: number;
    lastSlot: number;
}): void;
export declare function addFollow(userId: string, playerId: number, playerName: string): void;
export declare function removeFollow(userId: string, playerId: number): boolean;
export declare function listFollows(userId: string): {
    playerId: number;
    playerName: string;
}[];
/** userId → set of followed playerIds, for users following any of `playerIds`. */
export declare function getFollowersOf(playerIds: number[]): Map<string, Set<number>>;
/** Claims the one roll for an xG-victim shot. False if it was already rolled. */
export declare function claimXgShot(guildId: string, gameId: number, shotId: string): boolean;
/** Claims the DM for this user + goal. False if another tracker already sent it. */
export declare function claimFollowDm(userId: string, gameId: number, eventId: number): boolean;
export declare function addMemberFollow(guildId: string, followerId: string, targetId: string): void;
export declare function removeMemberFollow(guildId: string, followerId: string, targetId: string): boolean;
/** Members this user follows in this guild (user IDs). */
export declare function listMemberFollows(guildId: string, followerId: string): string[];
/** Users following this member in this guild (user IDs). */
export declare function getMemberFollowers(guildId: string, targetId: string): string[];
export declare function isFollowOptedOut(guildId: string, userId: string): boolean;
/** Opting out also removes everyone currently following this member. */
export declare function setFollowOptOut(guildId: string, userId: string, optedOut: boolean): void;
export declare function resetGameStart(guildId: string, gameId: number): void;
export declare function hasFeedItemBeenPosted(guildId: string, feedId: number, itemId: string): boolean;
export declare function markFeedItemPosted(guildId: string, feedId: number, itemId: string): void;
export declare function cleanupOldFeedItems(daysOld?: number): number;
export declare function hasDailyCardBeenPosted(guildId: string, date: string): boolean;
/** Returns true if this call claimed the (guild, date) pair; false if it was already claimed. */
export declare function markDailyCardPosted(guildId: string, date: string): boolean;
export declare function hasDailyCheckInBeenPosted(guildId: string, date: string): boolean;
/** Returns true if this call claimed the (guild, date) pair; false if it was already claimed. */
export declare function markDailyCheckInPosted(guildId: string, date: string): boolean;
export declare function hasAnyHscPostSeen(): boolean;
export declare function isHscPostSeen(uri: string): boolean;
/** Claims a Bluesky post; false if it was already seen/posted. */
export declare function markHscPostSeen(uri: string): boolean;
export declare function createReminder(guildId: string, channelId: string, userId: string, message: string, fireAt: string, dm: boolean): number;
export declare function getDueReminders(): Reminder[];
export declare function getUserReminders(guildId: string, userId: string): Reminder[];
export declare function cancelReminder(id: number, userId: string): boolean;
export declare function deleteReminder(id: number): void;
export declare function countUserReminders(guildId: string, userId: string): number;
export declare function hasBoardPost(board: string, guildId: string, messageId: string): boolean;
/** Claims the slot before posting; false if another reaction event already did (no double posts). */
export declare function claimBoardPost(board: string, guildId: string, messageId: string, channelId: string): boolean;
export declare function setBoardMessageId(board: string, guildId: string, messageId: string, boardMessageId: string): void;
export declare function releaseBoardPost(board: string, guildId: string, messageId: string): void;
export declare function getBoardMessageId(board: string, guildId: string, messageId: string): string | null;
export interface BoardPostRow {
    original_message_id: string;
    original_channel_id: string | null;
    board_message_id: string;
}
/** Posted board entries (board message exists), newest first. */
export declare function getBoardPosts(board: string, guildId: string): BoardPostRow[];
export declare function getAskPresets(guildId: string): AskPreset[];
export declare function addAskPreset(guildId: string, trigger: string, response: string, exactOnly: boolean, createdBy: string | null): number;
export declare function removeAskPreset(guildId: string, id: number): boolean;
/**
 * Seeds the starter presets the first time a guild is seen. Marked in ask_presets_seeded,
 * so a guild that later removes every preset doesn't get them back.
 */
export declare function seedAskPresetsOnce(guildId: string, presets: {
    trigger: string;
    response: string;
    exactOnly: boolean;
}[]): boolean;
export declare function logAsk(entry: {
    guildId: string;
    channelId: string | null;
    userId: string;
    day: string;
    question: string;
    tier: AskTier;
    answer: string | null;
    llmUsed: boolean;
    inputTokens: number;
    outputTokens: number;
}): number;
export declare function setAskReplyMessageId(logId: number, replyMessageId: string): void;
/** True if `messageId` is one of Tusky's Ask answers (replying to it continues the conversation). */
export declare function isAskReply(messageId: string): boolean;
/** LLM calls made today (America/Denver day) by a user (across guilds) and by a guild. */
export declare function countAskLlmUsage(guildId: string, userId: string, day: string): {
    user: number;
    guild: number;
};
/** Recent questions that went to the LLM or were deflected — candidates for new presets. */
export declare function getAskMisses(guildId: string, limit: number): AskLogEntry[];
//# sourceMappingURL=queries.d.ts.map