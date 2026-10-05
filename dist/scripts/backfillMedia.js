"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-off: save local copies of existing gif-command file links (Discord attachments,
 * direct file links). Tenor/Klipy/fxtwitter entries are left as links.
 *
 *   node dist/scripts/backfillMedia.js                 # dry run: what would happen
 *   node dist/scripts/backfillMedia.js --go            # download and save
 *   node dist/scripts/backfillMedia.js --go --remove-dead   # also delete entries whose file is gone (404)
 *
 * Run from the repo root on the VM (uses .env DISCORD_TOKEN and ./tusky.db).
 */
require("dotenv/config");
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../db/queries.js");
const media_js_1 = require("../services/media.js");
const go = process.argv.includes('--go');
const removeDead = process.argv.includes('--remove-dead');
async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token)
        throw new Error('DISCORD_TOKEN not set');
    const rest = new discord_js_1.REST().setToken(token);
    const todo = (0, queries_js_1.listAllGifEntries)().filter(e => !e.file_path && (0, media_js_1.isDownloadableFile)(e.url));
    console.log(`${todo.length} file links without a saved copy${go ? '' : ' (dry run; pass --go to download)'}`);
    if (!go) {
        for (const e of todo)
            console.log(`  !${e.key}\t${e.url.split('?')[0]}`);
        return;
    }
    // Upload limit depends on each server's boost tier
    const limits = new Map();
    for (const guildId of new Set(todo.map(e => e.guild_id))) {
        const guild = (await rest.get(discord_js_1.Routes.guild(guildId)));
        limits.set(guildId, (0, media_js_1.uploadLimitBytes)(guild.premium_tier));
    }
    let saved = 0;
    const dead = [];
    const failed = [];
    for (const e of todo) {
        try {
            (0, queries_js_1.setGifFilePath)(e.id, await (0, media_js_1.downloadMedia)(rest, e.guild_id, e.url, limits.get(e.guild_id)));
            saved++;
        }
        catch (err) {
            const label = `!${e.key} (${e.url.split('?')[0].split('/').pop()})`;
            if (err instanceof media_js_1.MediaError && err.status === 404) {
                dead.push(label);
                if (removeDead)
                    (0, queries_js_1.deleteGifEntryById)(e.id);
            }
            else {
                failed.push(`${label}: ${err instanceof Error ? err.message : err}`);
            }
        }
    }
    console.log(`Saved ${saved} of ${todo.length}`);
    if (dead.length)
        console.log(`File gone (404)${removeDead ? ', entry removed' : ''}: ${dead.join(', ')}`);
    if (failed.length)
        console.log(`Failed (left as links):\n  ${failed.join('\n  ')}`);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=backfillMedia.js.map