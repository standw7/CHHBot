/**
 * Render the post-game TOI charts to PNGs for review (no Discord). Uses the same loader as
 * the post-game post, including the fallback to the NHL's HTML shift reports.
 *   npx tsx src/scripts/renderToiChart.ts <gameId> <out.png> [teamCode=UTA]
 * Writes time-against-opponents to <out.png> and line combinations to <out>-lines.png.
 */
import { writeFileSync } from 'fs';
import { loadToiChart } from '../services/toiPost.js';

async function main(): Promise<void> {
  const [gameId, out, teamCode = 'UTA'] = process.argv.slice(2);
  if (!gameId || !out) throw new Error('usage: renderToiChart <gameId> <out.png> [teamCode]');
  const charts = await loadToiChart(Number(gameId), teamCode);
  if (charts === null || charts === 'incomplete') throw new Error(`chart unavailable: ${charts}`);
  const linesOut = out.replace(/(\.png)?$/i, '-lines.png');
  writeFileSync(out, charts.against.png);
  writeFileSync(linesOut, charts.lines.png);
  console.log(`wrote ${out} (${charts.against.title})`);
  console.log(`wrote ${linesOut} (${charts.lines.title})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
