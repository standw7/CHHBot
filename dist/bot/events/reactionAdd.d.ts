import { Client, EmbedBuilder, Message, AttachmentBuilder } from 'discord.js';
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
export declare function registerReactionHandler(client: Client): void;
//# sourceMappingURL=reactionAdd.d.ts.map