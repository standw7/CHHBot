import path from 'path';
import { existsSync } from 'fs';
import type { Client, GuildMember, APIInteractionGuildMember, PermissionsBitField } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import pino from 'pino';
import { getGuildConfig } from '../db/queries.js';
import type { GifCommand, GuildConfig } from '../db/models.js';
import { MEDIA_DIR, displayFileName } from './media.js';

const logger = pino({ name: 'gif-log' });

/**
 * Who may change gif commands:
 * - 'admin': Manage Server — everything, including deleting/renaming whole keys
 * - 'contributor': has the configured gif contributor role — add and remove single entries
 * - null: neither
 */
export type GifAccess = 'admin' | 'contributor' | null;

export function gifAccess(
  isAdmin: boolean,
  roleIds: readonly string[],
  config: Pick<GuildConfig, 'gif_contributor_role_id'> | null | undefined,
): GifAccess {
  if (isAdmin) return 'admin';
  const role = config?.gif_contributor_role_id;
  if (role && roleIds.includes(role)) return 'contributor';
  return null;
}

/** gifAccess for a message author or interaction member (cached or raw API member). */
export function memberGifAccess(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
  permissions: Readonly<PermissionsBitField> | null | undefined,
  guildId: string,
): GifAccess {
  const roles = member?.roles;
  const roleIds = !roles ? [] : Array.isArray(roles) ? roles : [...roles.cache.keys()];
  return gifAccess(!!permissions?.has(PermissionFlagsBits.ManageGuild), roleIds, getGuildConfig(guildId));
}

export const CONTRIBUTOR_DENIED = 'You need Manage Server permission or the gif contributor role.';

type LogAction =
  | { kind: 'add'; entry: GifCommand }
  | { kind: 'remove'; entries: GifCommand[] }
  | { kind: 'delete'; key: string; entries: GifCommand[] }
  | { kind: 'rename'; oldKey: string; newKey: string; count: number };

/** Text of a log message. Exported for tests. */
export function logLine(actorId: string, action: LogAction): string {
  const who = `<@${actorId}>`;
  switch (action.kind) {
    case 'add':
      return `➕ ${who} added to **${action.entry.key}**`;
    case 'remove':
      return `🗑️ ${who} removed from **${action.entries[0].key}**`;
    case 'delete':
      return `💥 ${who} deleted key **${action.key}** (${action.entries.length} items)`;
    case 'rename':
      return `✏️ ${who} renamed **${action.oldKey}** → **${action.newKey}** (${action.count} items)`;
  }
}

/** One log message per entry: its saved file attached (so it survives removal), or its link. */
function entryPayload(header: string, entry: GifCommand, removed: boolean) {
  const abs = entry.file_path ? path.join(MEDIA_DIR, entry.file_path) : null;
  const restore = removed ? `\nTo restore, reply to this message with \`!gif add ${entry.key}\`` : '';
  if (abs && existsSync(abs)) {
    // <url> suppresses the link's embed so a restore only picks up the attached file
    return {
      content: `${header}\n<${entry.url}>${restore}`,
      files: [{ attachment: abs, name: displayFileName(entry.file_path!) }],
    };
  }
  // Link entries (Tenor etc.): left bare so Discord embeds it, which a restore picks up
  return { content: `${header}\n${entry.url}${restore}` };
}

/**
 * Posts a gif change to the configured log channel. No-op if none is set.
 * Never throws: a broken log channel must not break gif commands.
 */
export async function logGifAction(client: Client, guildId: string, actorId: string, action: LogAction): Promise<void> {
  const channelId = getGuildConfig(guildId)?.gif_log_channel_id;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) {
      logger.warn({ guildId, channelId }, 'Gif log channel missing or not sendable');
      return;
    }
    const allowedMentions = { parse: [] as never[] };
    const header = logLine(actorId, action);
    if (action.kind === 'add') {
      await channel.send({ ...entryPayload(header, action.entry, false), allowedMentions });
    } else if (action.kind === 'rename') {
      await channel.send({ content: header, allowedMentions });
    } else {
      if (action.kind === 'delete') await channel.send({ content: header, allowedMentions });
      for (const entry of action.entries) {
        const h = action.kind === 'delete' ? `↳ from **${entry.key}**` : header;
        await channel.send({ ...entryPayload(h, entry, true), allowedMentions });
      }
    }
  } catch (err) {
    logger.warn({ err, guildId, channelId }, 'Failed to post gif log');
  }
}
