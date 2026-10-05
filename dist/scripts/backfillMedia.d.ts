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
import 'dotenv/config';
//# sourceMappingURL=backfillMedia.d.ts.map