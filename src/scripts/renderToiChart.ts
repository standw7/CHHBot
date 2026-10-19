/**
 * Render a TOI chart to a PNG for review (no Discord).
 *   npx tsx src/scripts/renderToiChart.ts <gameId> <out.png> [teamCode=UTA]
 */
import { writeFileSync } from 'fs';
import * as nhlClient from '../nhl/client.js';
import { toiChartInputFromGame } from '../services/toiPost.js';
import { buildToiSvg, renderPng } from '../services/toiRender.js';

async function main(): Promise<void> {
  const [gameId, out, teamCode = 'UTA'] = process.argv.slice(2);
  if (!gameId || !out) throw new Error('usage: renderToiChart <gameId> <out.png> [teamCode]');
  const [shifts, box] = await Promise.all([nhlClient.getShiftChart(Number(gameId)), nhlClient.getBoxscore(Number(gameId))]);
  if (!shifts || !box?.playerByGameStats) throw new Error('could not load game');
  const input = toiChartInputFromGame(
    shifts.data,
    { abbrev: box.homeTeam.abbrev, ...box.playerByGameStats.homeTeam },
    { abbrev: box.awayTeam.abbrev, ...box.playerByGameStats.awayTeam },
    teamCode
  );
  if (input === null || input === 'incomplete') throw new Error(`chart unavailable: ${input}`);
  writeFileSync(out, renderPng(buildToiSvg(input)));
  console.log(`wrote ${out}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
