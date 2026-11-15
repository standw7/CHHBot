/**
 * Render a TOI chart to a PNG for review (no Discord). Uses the same loader as the
 * post-game chart, including the fallback to the NHL's HTML shift reports.
 *   npx tsx src/scripts/renderToiChart.ts <gameId> <out.png> [teamCode=UTA]
 */
import { writeFileSync } from 'fs';
import { loadToiChart } from '../services/toiPost.js';

async function main(): Promise<void> {
  const [gameId, out, teamCode = 'UTA'] = process.argv.slice(2);
  if (!gameId || !out) throw new Error('usage: renderToiChart <gameId> <out.png> [teamCode]');
  const chart = await loadToiChart(Number(gameId), teamCode);
  if (chart === null || chart === 'incomplete') throw new Error(`chart unavailable: ${chart}`);
  writeFileSync(out, chart.png);
  console.log(`wrote ${out} (${chart.title})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
