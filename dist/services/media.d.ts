import type { REST } from 'discord.js';
import type { GifCommand } from '../db/models.js';
export declare const MEDIA_DIR: string;
export declare const MAX_MEDIA_BYTES: number;
/** Upload limit for a server's boost tier (Guild.premiumTier / premium_tier). */
export declare function uploadLimitBytes(premiumTier: number): number;
export declare function isDiscordAttachment(url: string): boolean;
/** True for links to actual files Tusky should keep a copy of; false for Tenor/Klipy/fxtwitter and page links. */
export declare function isDownloadableFile(url: string): boolean;
/**
 * Only Discord's attachment links expire. Any other file link that can't be saved
 * (e.g. Imgur blocks the VM's IP with 429s) still works as a plain link.
 */
export declare function canFallBackToLink(url: string): boolean;
/** Null if acceptable, otherwise a user-facing reason. */
export declare function validateMedia(contentType: string | null, size: number, maxBytes?: number): string | null;
/** Stored paths look like `<guildId>/<timestamp>-<name>`; this is the name shown in Discord. */
export declare function displayFileName(filePath: string): string;
export declare class MediaError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
/**
 * Downloads a file link into MEDIA_DIR/<guildId>/ and returns its stored relative path.
 * Throws MediaError with a user-facing message if it can't be fetched or isn't acceptable.
 */
export declare function downloadMedia(rest: REST, guildId: string, url: string, maxBytes?: number): Promise<string>;
export declare function deleteMediaFile(filePath: string | null | undefined): Promise<void>;
/**
 * Message payload for a gif-command entry: the saved file as an attachment (images
 * render inline, audio gets Discord's audio player), or the link for Tenor/Klipy etc.
 * Falls back to the link if the saved file is missing on disk.
 */
export declare function buildMediaMessage(entry: {
    url: string;
    file_path: string | null;
}): {
    content: string;
} | {
    files: {
        attachment: string;
        name: string;
    }[];
};
/**
 * Adds a gif-command entry. File links are downloaded and saved ('saved'); Tenor/Klipy
 * and page links are stored as links ('link'). A non-Discord file that can't be saved is
 * stored as a link ('link_fallback'). Throws MediaError if a Discord file can't be saved.
 */
export declare function addGifEntry(rest: REST, guildId: string, key: string, url: string, addedBy: string, maxBytes?: number): Promise<'saved' | 'link' | 'link_fallback'>;
export declare function removeGifEntry(guildId: string, key: string, url: string): Promise<boolean>;
/** The list number in `!gif remove key:goal 3` (or `#3`), or null if there isn't one. */
export declare function parseListNumber(args: string[]): number | null;
/** Entry shown as number `n` (1-based) in the list command, or null if out of range. */
export declare function entryForListNumber<T>(entries: T[], n: number): T | null;
/** Remove the entry shown as number `n` in the list command. Returns it, or null if out of range. */
export declare function removeGifEntryByNumber(guildId: string, key: string, n: number): Promise<GifCommand | null>;
export declare function deleteGifKeyAndMedia(guildId: string, key: string): Promise<number>;
export declare const ADD_REPLIES: Record<'saved' | 'link' | 'link_fallback', (key: string) => string>;
//# sourceMappingURL=media.d.ts.map