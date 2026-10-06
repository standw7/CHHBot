import { mkdir, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { REST } from 'discord.js';
import pino from 'pino';
import { addGifUrl, removeGifUrl, deleteGifKey } from '../db/queries.js';

const logger = pino({ name: 'media' });

// Saved copies of gif-command files live here (gitignored). Paths in the DB are relative to it.
export const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), 'media');

// Discord's upload limit in an unboosted server; boosting raises it for bots too.
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/** Upload limit for a server's boost tier (Guild.premiumTier / premium_tier). */
export function uploadLimitBytes(premiumTier: number): number {
  if (premiumTier >= 3) return 100 * 1024 * 1024;
  if (premiumTier === 2) return 50 * 1024 * 1024;
  return MAX_MEDIA_BYTES;
}

// Services whose links Discord embeds itself — always posted as links, never downloaded.
const KEEP_AS_LINK_HOSTS = ['tenor.com', 'klipy.com', 'fxtwitter.com'];

const MEDIA_EXTENSIONS = new Set([
  'gif', 'png', 'jpg', 'jpeg', 'webp',
  'mp4', 'mov', 'webm',
  'mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'flac', 'aac',
]);

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isDiscordAttachment(url: string): boolean {
  const u = parse(url);
  if (!u) return false;
  return (u.hostname === 'cdn.discordapp.com' || u.hostname === 'media.discordapp.net') && u.pathname.startsWith('/attachments/');
}

/** True for links to actual files Tusky should keep a copy of; false for Tenor/Klipy/fxtwitter and page links. */
export function isDownloadableFile(url: string): boolean {
  const u = parse(url);
  if (!u) return false;
  if (KEEP_AS_LINK_HOSTS.some(d => hostMatches(u.hostname, d))) return false;
  if (isDiscordAttachment(url)) return true;
  const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_EXTENSIONS.has(ext);
}

/**
 * Only Discord's attachment links expire. Any other file link that can't be saved
 * (e.g. Imgur blocks the VM's IP with 429s) still works as a plain link.
 */
export function canFallBackToLink(url: string): boolean {
  return !isDiscordAttachment(url);
}

/** Null if acceptable, otherwise a user-facing reason. */
export function validateMedia(contentType: string | null, size: number, maxBytes: number = MAX_MEDIA_BYTES): string | null {
  const type = contentType?.split(';')[0].trim().toLowerCase() ?? '';
  if (!/^(image|video|audio)\//.test(type)) return "That link isn't an image, video or audio file.";
  if (size > maxBytes) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    return `That file is too big (${mb(size)} MB). Discord lets bots upload up to ${Math.round(maxBytes / 1024 / 1024)} MB in this server.`;
  }
  return null;
}

/** Stored paths look like `<guildId>/<timestamp>-<name>`; this is the name shown in Discord. */
export function displayFileName(filePath: string): string {
  return path.basename(filePath).replace(/^\d+-/, '');
}

export class MediaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** Signed Discord CDN links expire; ask Discord for a fresh one (fails if the original message was deleted). */
async function refreshDiscordUrl(rest: REST, url: string): Promise<string> {
  const res = (await rest.post('/attachments/refresh-urls', { body: { attachment_urls: [url] } })) as {
    refreshed_urls?: { original: string; refreshed: string }[];
  };
  return res.refreshed_urls?.[0]?.refreshed ?? url;
}

/**
 * Downloads a file link into MEDIA_DIR/<guildId>/ and returns its stored relative path.
 * Throws MediaError with a user-facing message if it can't be fetched or isn't acceptable.
 */
export async function downloadMedia(rest: REST, guildId: string, url: string, maxBytes: number = MAX_MEDIA_BYTES): Promise<string> {
  const fetchUrl = isDiscordAttachment(url) ? await refreshDiscordUrl(rest, url) : url;

  const res = await fetch(fetchUrl, { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
  if (!res.ok) {
    throw new MediaError(
      res.status === 404
        ? "That file doesn't exist anymore (if it was uploaded to Discord, the original message may have been deleted)."
        : `Couldn't download that file (HTTP ${res.status}).`,
      res.status
    );
  }

  const declared = Number(res.headers.get('content-length') ?? 0);
  const early = validateMedia(res.headers.get('content-type'), declared, maxBytes);
  if (early) throw new MediaError(early);

  const data = Buffer.from(await res.arrayBuffer());
  const problem = validateMedia(res.headers.get('content-type'), data.length, maxBytes);
  if (problem) throw new MediaError(problem);

  const originalName = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'media');
  const safeName = originalName.replace(/[^\w.-]/g, '_').slice(-100);
  const relPath = path.join(guildId, `${Date.now()}-${safeName}`);
  await mkdir(path.join(MEDIA_DIR, guildId), { recursive: true });
  await writeFile(path.join(MEDIA_DIR, relPath), data);
  logger.info({ guildId, relPath, bytes: data.length }, 'Saved media copy');
  return relPath;
}

export async function deleteMediaFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(path.join(MEDIA_DIR, filePath));
  } catch (err) {
    logger.warn({ err, filePath }, 'Could not delete media file');
  }
}

/**
 * Message payload for a gif-command entry: the saved file as an attachment (images
 * render inline, audio gets Discord's audio player), or the link for Tenor/Klipy etc.
 * Falls back to the link if the saved file is missing on disk.
 */
export function buildMediaMessage(entry: { url: string; file_path: string | null }):
  { content: string } | { files: { attachment: string; name: string }[] } {
  if (entry.file_path) {
    const abs = path.join(MEDIA_DIR, entry.file_path);
    if (existsSync(abs)) return { files: [{ attachment: abs, name: displayFileName(entry.file_path) }] };
    logger.warn({ filePath: entry.file_path }, 'Saved media file missing, posting link instead');
  }
  return { content: entry.url };
}

/**
 * Adds a gif-command entry. File links are downloaded and saved ('saved'); Tenor/Klipy
 * and page links are stored as links ('link'). A non-Discord file that can't be saved is
 * stored as a link ('link_fallback'). Throws MediaError if a Discord file can't be saved.
 */
export async function addGifEntry(
  rest: REST,
  guildId: string,
  key: string,
  url: string,
  addedBy: string,
  maxBytes: number = MAX_MEDIA_BYTES
): Promise<'saved' | 'link' | 'link_fallback'> {
  if (!isDownloadableFile(url)) {
    addGifUrl(guildId, key, url, addedBy);
    return 'link';
  }
  try {
    const filePath = await downloadMedia(rest, guildId, url, maxBytes);
    addGifUrl(guildId, key, url, addedBy, filePath);
    return 'saved';
  } catch (err) {
    logger.warn({ err, guildId, key, url }, 'Could not save media copy');
    if (err instanceof MediaError && canFallBackToLink(url)) {
      addGifUrl(guildId, key, url, addedBy);
      return 'link_fallback';
    }
    throw err;
  }
}

export async function removeGifEntry(guildId: string, key: string, url: string): Promise<boolean> {
  const { removed, filePaths } = removeGifUrl(guildId, key, url);
  await Promise.all(filePaths.map(deleteMediaFile));
  return removed > 0;
}

export async function deleteGifKeyAndMedia(guildId: string, key: string): Promise<number> {
  const { removed, filePaths } = deleteGifKey(guildId, key);
  await Promise.all(filePaths.map(deleteMediaFile));
  return removed;
}

export const ADD_REPLIES: Record<'saved' | 'link' | 'link_fallback', (key: string) => string> = {
  saved: key => `Saved a copy and added it to **${key}**.`,
  link: key => `Added link to **${key}**.`,
  link_fallback: key => `Added to **${key}** as a link (that site wouldn't let Tusky save a copy, but its links don't expire).`,
};
