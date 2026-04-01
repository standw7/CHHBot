import { Client } from 'discord.js';
export declare function startFeedWatcher(client: Client): void;
/** Force-poll all feeds for a specific guild. Returns a summary of what happened. */
export declare function forceCheckFeeds(client: Client, guildId: string, targetLabel?: string): Promise<string[]>;
export declare function stopFeedWatcher(): void;
//# sourceMappingURL=feedWatcher.d.ts.map