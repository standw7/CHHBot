import type { EmbedBuilder, Guild } from 'discord.js';
import type { GuildConfig } from '../../db/models.js';
import { type AskIntent } from './intents.js';
export interface DataReply {
    content?: string;
    embeds?: EmbedBuilder[];
    logText: string;
}
/**
 * Runs a tier-2 intent against the existing lookups. Returns null when the match turns out
 * not to be confident (e.g. the name isn't someone on the roster), so the caller falls
 * through to the LLM.
 */
export declare function runDataIntent(intent: AskIntent, guild: Guild, config: GuildConfig | undefined): Promise<DataReply | null>;
//# sourceMappingURL=data.d.ts.map