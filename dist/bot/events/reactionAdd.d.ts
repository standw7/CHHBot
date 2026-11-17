import { Client, EmbedBuilder, Message, TextChannel, AttachmentBuilder } from 'discord.js';
import type { GuildConfig } from '../../db/models.js';
import { HOF_EMOJIS } from '../../services/hofScan.js';
import { isTomatoEmoji } from '../../services/hofLinks.js';
export { HOF_EMOJIS, isTomatoEmoji };
export interface HofPostData {
    embed: EmbedBuilder;
    /** The inducted message's own links (social ones rewritten to embed-fix domains). */
    embedLinks: string[];
    files: AttachmentBuilder[];
    authorName: string;
    /** Links from the replied-to message (minus any already in embedLinks). */
    replyLinks: string[];
    replyAuthorName: string | null;
}
/**
 * Build a full HOF post from a Discord message.
 * Returns the embed, the message's links (and the replied-to message's links) to send as
 * follow-ups, and video attachments. Exported so the rebuild command can reuse it.
 */
export declare function buildHofPost(message: Message, guildId: string, channelId: string, messageId: string): Promise<HofPostData>;
export interface FollowupIds {
    followupId: string | null;
    replyFollowupId: string | null;
}
/**
 * Send the follow-up messages that sit under a HoF / Tomato Town card:
 *   - the inducted message's own links (+ Instagram captions) and video files. When a reply
 *     follow-up is coming too, it is labelled `-# 🔥 <author>'s post` to tell them apart.
 *   - if the replied-to message had links: `-# ↩ Replying to <author>` + those links.
 * Shared by HoF inductions, the HoF rebuild command, and Tomato Town.
 */
export declare function sendBoardFollowups(tc: TextChannel, post: HofPostData, emoji: string): Promise<FollowupIds>;
/**
 * Build a HoF post for the given message and post it to the guild's HoF channel,
 * marking it inducted (and recording any follow-up messages) in the DB.
 * Returns true when it posted, false if the HoF channel could not be resolved.
 * Shared by the reaction handler and the `!hof scan` backfill command.
 */
export declare function inductMessage(message: Message, guildId: string, config: GuildConfig, options?: {
    notifyFollowers?: boolean;
}): Promise<boolean>;
/**
 * One-time startup pass: bring every Tomato Town post's `🍅 **N**` header up to date
 * (posts made before counts went live all froze at the threshold). Sequential and throttled;
 * deleted posts/messages/channels are skipped. Only posts whose count differs are edited.
 */
export declare function refreshTomatoCounts(client: Client): Promise<void>;
export declare function registerReactionHandler(client: Client): void;
//# sourceMappingURL=reactionAdd.d.ts.map