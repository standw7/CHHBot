import type { Client } from 'discord.js';
import { type CapLimits } from './guards.js';
import { type MessagesClient } from './llm.js';
export interface AskOptions {
    apiKey?: string;
    caps: CapLimits;
    /** Injected in tests; defaults to the SDK client when apiKey is set. */
    llmClient?: MessagesClient;
}
export declare function registerAskHandler(client: Client, options: AskOptions): void;
/** Bot user id mentioned directly in the text (not via reply ping, role, or @everyone). */
export declare function mentionsBotDirectly(content: string, botId: string): boolean;
export declare function stripBotMention(content: string, botId: string): string;
//# sourceMappingURL=index.d.ts.map