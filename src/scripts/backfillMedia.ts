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
import { REST } from 'discord.js';
import { listAllGifEntries, setGifFilePath, deleteGifEntryById } from '../db/queries.js';
import { isDownloadableFile, downloadMedia, MediaError } from '../services/media.js';

const go = process.argv.includes('--go');
const removeDead = process.argv.includes('--remove-dead');

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');
  const rest = new REST().setToken(token);

  const todo = listAllGifEntries().filter(e => !e.file_path && isDownloadableFile(e.url));
  console.log(`${todo.length} file links without a saved copy${go ? '' : ' (dry run; pass --go to download)'}`);
  if (!go) {
    for (const e of todo) console.log(`  !${e.key}\t${e.url.split('?')[0]}`);
    return;
  }

  let saved = 0;
  const dead: string[] = [];
  const failed: string[] = [];
  for (const e of todo) {
    try {
      setGifFilePath(e.id, await downloadMedia(rest, e.guild_id, e.url));
      saved++;
    } catch (err) {
      const label = `!${e.key} (${e.url.split('?')[0].split('/').pop()})`;
      if (err instanceof MediaError && err.status === 404) {
        dead.push(label);
        if (removeDead) deleteGifEntryById(e.id);
      } else {
        failed.push(`${label}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(`Saved ${saved} of ${todo.length}`);
  if (dead.length) console.log(`File gone (404)${removeDead ? ', entry removed' : ''}: ${dead.join(', ')}`);
  if (failed.length) console.log(`Failed (left as links):\n  ${failed.join('\n  ')}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
