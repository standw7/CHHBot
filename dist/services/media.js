"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaError = exports.MAX_MEDIA_BYTES = exports.MEDIA_DIR = void 0;
exports.uploadLimitBytes = uploadLimitBytes;
exports.isDiscordAttachment = isDiscordAttachment;
exports.isDownloadableFile = isDownloadableFile;
exports.validateMedia = validateMedia;
exports.displayFileName = displayFileName;
exports.downloadMedia = downloadMedia;
exports.deleteMediaFile = deleteMediaFile;
exports.buildMediaMessage = buildMediaMessage;
exports.addGifEntry = addGifEntry;
exports.removeGifEntry = removeGifEntry;
exports.deleteGifKeyAndMedia = deleteGifKeyAndMedia;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../db/queries.js");
const logger = (0, pino_1.default)({ name: 'media' });
// Saved copies of gif-command files live here (gitignored). Paths in the DB are relative to it.
exports.MEDIA_DIR = process.env.MEDIA_DIR || path_1.default.join(process.cwd(), 'media');
// Discord's upload limit in an unboosted server; boosting raises it for bots too.
exports.MAX_MEDIA_BYTES = 10 * 1024 * 1024;
/** Upload limit for a server's boost tier (Guild.premiumTier / premium_tier). */
function uploadLimitBytes(premiumTier) {
    if (premiumTier >= 3)
        return 100 * 1024 * 1024;
    if (premiumTier === 2)
        return 50 * 1024 * 1024;
    return exports.MAX_MEDIA_BYTES;
}
// Services whose links Discord embeds itself — always posted as links, never downloaded.
const KEEP_AS_LINK_HOSTS = ['tenor.com', 'klipy.com', 'fxtwitter.com'];
const MEDIA_EXTENSIONS = new Set([
    'gif', 'png', 'jpg', 'jpeg', 'webp',
    'mp4', 'mov', 'webm',
    'mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'flac', 'aac',
]);
function parse(url) {
    try {
        return new URL(url);
    }
    catch {
        return null;
    }
}
function hostMatches(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
}
function isDiscordAttachment(url) {
    const u = parse(url);
    if (!u)
        return false;
    return (u.hostname === 'cdn.discordapp.com' || u.hostname === 'media.discordapp.net') && u.pathname.startsWith('/attachments/');
}
/** True for links to actual files Tusky should keep a copy of; false for Tenor/Klipy/fxtwitter and page links. */
function isDownloadableFile(url) {
    const u = parse(url);
    if (!u)
        return false;
    if (KEEP_AS_LINK_HOSTS.some(d => hostMatches(u.hostname, d)))
        return false;
    if (isDiscordAttachment(url))
        return true;
    const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
    return MEDIA_EXTENSIONS.has(ext);
}
/** Null if acceptable, otherwise a user-facing reason. */
function validateMedia(contentType, size, maxBytes = exports.MAX_MEDIA_BYTES) {
    const type = contentType?.split(';')[0].trim().toLowerCase() ?? '';
    if (!/^(image|video|audio)\//.test(type))
        return "That link isn't an image, video or audio file.";
    if (size > maxBytes) {
        const mb = (n) => (n / 1024 / 1024).toFixed(1);
        return `That file is too big (${mb(size)} MB). Discord lets bots upload up to ${Math.round(maxBytes / 1024 / 1024)} MB in this server.`;
    }
    return null;
}
/** Stored paths look like `<guildId>/<timestamp>-<name>`; this is the name shown in Discord. */
function displayFileName(filePath) {
    return path_1.default.basename(filePath).replace(/^\d+-/, '');
}
class MediaError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
exports.MediaError = MediaError;
/** Signed Discord CDN links expire; ask Discord for a fresh one (fails if the original message was deleted). */
async function refreshDiscordUrl(rest, url) {
    const res = (await rest.post('/attachments/refresh-urls', { body: { attachment_urls: [url] } }));
    return res.refreshed_urls?.[0]?.refreshed ?? url;
}
/**
 * Downloads a file link into MEDIA_DIR/<guildId>/ and returns its stored relative path.
 * Throws MediaError with a user-facing message if it can't be fetched or isn't acceptable.
 */
async function downloadMedia(rest, guildId, url, maxBytes = exports.MAX_MEDIA_BYTES) {
    const fetchUrl = isDiscordAttachment(url) ? await refreshDiscordUrl(rest, url) : url;
    const res = await fetch(fetchUrl, { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
    if (!res.ok) {
        throw new MediaError(res.status === 404
            ? "That file doesn't exist anymore (if it was uploaded to Discord, the original message may have been deleted)."
            : `Couldn't download that file (HTTP ${res.status}).`, res.status);
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    const early = validateMedia(res.headers.get('content-type'), declared, maxBytes);
    if (early)
        throw new MediaError(early);
    const data = Buffer.from(await res.arrayBuffer());
    const problem = validateMedia(res.headers.get('content-type'), data.length, maxBytes);
    if (problem)
        throw new MediaError(problem);
    const originalName = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'media');
    const safeName = originalName.replace(/[^\w.-]/g, '_').slice(-100);
    const relPath = path_1.default.join(guildId, `${Date.now()}-${safeName}`);
    await (0, promises_1.mkdir)(path_1.default.join(exports.MEDIA_DIR, guildId), { recursive: true });
    await (0, promises_1.writeFile)(path_1.default.join(exports.MEDIA_DIR, relPath), data);
    logger.info({ guildId, relPath, bytes: data.length }, 'Saved media copy');
    return relPath;
}
async function deleteMediaFile(filePath) {
    if (!filePath)
        return;
    try {
        await (0, promises_1.unlink)(path_1.default.join(exports.MEDIA_DIR, filePath));
    }
    catch (err) {
        logger.warn({ err, filePath }, 'Could not delete media file');
    }
}
/**
 * Message payload for a gif-command entry: the saved file as an attachment (images
 * render inline, audio gets Discord's audio player), or the link for Tenor/Klipy etc.
 * Falls back to the link if the saved file is missing on disk.
 */
function buildMediaMessage(entry) {
    if (entry.file_path) {
        const abs = path_1.default.join(exports.MEDIA_DIR, entry.file_path);
        if ((0, fs_1.existsSync)(abs))
            return { files: [{ attachment: abs, name: displayFileName(entry.file_path) }] };
        logger.warn({ filePath: entry.file_path }, 'Saved media file missing, posting link instead');
    }
    return { content: entry.url };
}
/**
 * Adds a gif-command entry. File links are downloaded and saved ('saved'); Tenor/Klipy
 * and page links are stored as links ('link'). Throws MediaError if a file can't be saved.
 */
async function addGifEntry(rest, guildId, key, url, addedBy, maxBytes = exports.MAX_MEDIA_BYTES) {
    if (!isDownloadableFile(url)) {
        (0, queries_js_1.addGifUrl)(guildId, key, url, addedBy);
        return 'link';
    }
    const filePath = await downloadMedia(rest, guildId, url, maxBytes);
    (0, queries_js_1.addGifUrl)(guildId, key, url, addedBy, filePath);
    return 'saved';
}
async function removeGifEntry(guildId, key, url) {
    const { removed, filePaths } = (0, queries_js_1.removeGifUrl)(guildId, key, url);
    await Promise.all(filePaths.map(deleteMediaFile));
    return removed > 0;
}
async function deleteGifKeyAndMedia(guildId, key) {
    const { removed, filePaths } = (0, queries_js_1.deleteGifKey)(guildId, key);
    await Promise.all(filePaths.map(deleteMediaFile));
    return removed;
}
//# sourceMappingURL=media.js.map