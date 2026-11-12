import type { Client, GuildMember, APIInteractionGuildMember, PermissionsBitField } from 'discord.js';
import type { GifCommand, GuildConfig } from '../db/models.js';
/**
 * Who may change gif commands:
 * - 'admin': Manage Server — everything, including deleting/renaming whole keys
 * - 'contributor': has the configured gif contributor role — add and remove single entries
 * - null: neither
 */
export type GifAccess = 'admin' | 'contributor' | null;
export declare function gifAccess(isAdmin: boolean, roleIds: readonly string[], config: Pick<GuildConfig, 'gif_contributor_role_id'> | null | undefined): GifAccess;
/** gifAccess for a message author or interaction member (cached or raw API member). */
export declare function memberGifAccess(member: GuildMember | APIInteractionGuildMember | null | undefined, permissions: Readonly<PermissionsBitField> | null | undefined, guildId: string): GifAccess;
export declare const CONTRIBUTOR_DENIED = "You need Manage Server permission or the gif contributor role.";
type LogAction = {
    kind: 'add';
    entry: GifCommand;
} | {
    kind: 'remove';
    entries: GifCommand[];
} | {
    kind: 'delete';
    key: string;
    entries: GifCommand[];
} | {
    kind: 'rename';
    oldKey: string;
    newKey: string;
    count: number;
};
/** Text of a log message. Exported for tests. */
export declare function logLine(actorId: string, action: LogAction): string;
/**
 * Posts a gif change to the configured log channel. No-op if none is set.
 * Never throws: a broken log channel must not break gif commands.
 */
export declare function logGifAction(client: Client, guildId: string, actorId: string, action: LogAction): Promise<void>;
export {};
//# sourceMappingURL=gifLog.d.ts.map