"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Render the post-game TOI charts to PNGs for review (no Discord). Uses the same loader as
 * the post-game post, including the fallback to the NHL's HTML shift reports.
 *   npx tsx src/scripts/renderToiChart.ts <gameId> <out.png> [teamCode=UTA]
 * Writes time-against-opponents to <out.png> and line combinations to <out>-lines.png.
 */
const fs_1 = require("fs");
const toiPost_js_1 = require("../services/toiPost.js");
async function main() {
    const [gameId, out, teamCode = 'UTA'] = process.argv.slice(2);
    if (!gameId || !out)
        throw new Error('usage: renderToiChart <gameId> <out.png> [teamCode]');
    const charts = await (0, toiPost_js_1.loadToiChart)(Number(gameId), teamCode);
    if (charts === null || charts === 'incomplete')
        throw new Error(`chart unavailable: ${charts}`);
    const linesOut = out.replace(/(\.png)?$/i, '-lines.png');
    (0, fs_1.writeFileSync)(out, charts.against.png);
    (0, fs_1.writeFileSync)(linesOut, charts.lines.png);
    console.log(`wrote ${out} (${charts.against.title})`);
    console.log(`wrote ${linesOut} (${charts.lines.title})`);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=renderToiChart.js.map