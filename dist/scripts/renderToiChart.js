"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Render a TOI chart to a PNG for review (no Discord). Uses the same loader as the
 * post-game chart, including the fallback to the NHL's HTML shift reports.
 *   npx tsx src/scripts/renderToiChart.ts <gameId> <out.png> [teamCode=UTA]
 */
const fs_1 = require("fs");
const toiPost_js_1 = require("../services/toiPost.js");
async function main() {
    const [gameId, out, teamCode = 'UTA'] = process.argv.slice(2);
    if (!gameId || !out)
        throw new Error('usage: renderToiChart <gameId> <out.png> [teamCode]');
    const chart = await (0, toiPost_js_1.loadToiChart)(Number(gameId), teamCode);
    if (chart === null || chart === 'incomplete')
        throw new Error(`chart unavailable: ${chart}`);
    (0, fs_1.writeFileSync)(out, chart.png);
    console.log(`wrote ${out} (${chart.title})`);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=renderToiChart.js.map