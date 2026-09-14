import { Client, EmbedBuilder, Message, AttachmentBuilder } from 'discord.js';
import type { GuildConfig } from '../../db/models.js';
import { HOF_EMOJIS } from '../../services/hofScan.js';
export { HOF_EMOJIS };
export interface HofPostData {
    embed: EmbedBuilder;
    embedLinks: string[];
    files: AttachmentBuilder[];
}
/**
 * Build a full HOF post from a Discord message.
 * Returns the embed, any fxtwitter links (to send as a separate follow-up), and file attachments.
 * Exported so the backfill command can reuse it.
 */
export declare function buildHofPost(message: Message, guildId: string, channelId: string, messageId: string): Promise<HofPostData>;
/**
 * Build a HoF post for the given message and post it to the guild's HoF channel,
 * marking it inducted (and recording any follow-up message) in the DB.
 * Returns true when it posted, false if the HoF channel could not be resolved.
 * Shared by the reaction handler and the `!hof scan` backfill command.
 */
export declare function inductMessage(message: Message, guildId: string, config: GuildConfig): Promise<boolean>;
export declare function registerReactionHandler(client: Client): void;
//# sourceMappingURL=reactionAdd.d.ts.map