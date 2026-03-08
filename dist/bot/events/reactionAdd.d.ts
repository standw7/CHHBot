import { Client, EmbedBuilder, Message, AttachmentBuilder } from 'discord.js';
export interface HofPostData {
    embed: EmbedBuilder;
    content: string | undefined;
    files: AttachmentBuilder[];
}
/**
 * Build a full HOF post from a Discord message.
 * Exported so the backfill command can reuse it.
 */
export declare function buildHofPost(message: Message, guildId: string, channelId: string, messageId: string): Promise<HofPostData>;
export declare function registerReactionHandler(client: Client): void;
//# sourceMappingURL=reactionAdd.d.ts.map