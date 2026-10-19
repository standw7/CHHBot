"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Render a TOI chart to a PNG for review (no Discord).
 *   npx tsx src/scripts/renderToiChart.ts <gameId> <out.png> [teamCode=UTA]
 */
const fs_1 = require("fs");
const nhlClient = __importStar(require("../nhl/client.js"));
const toiPost_js_1 = require("../services/toiPost.js");
const toiRender_js_1 = require("../services/toiRender.js");
async function main() {
    const [gameId, out, teamCode = 'UTA'] = process.argv.slice(2);
    if (!gameId || !out)
        throw new Error('usage: renderToiChart <gameId> <out.png> [teamCode]');
    const [shifts, box] = await Promise.all([nhlClient.getShiftChart(Number(gameId)), nhlClient.getBoxscore(Number(gameId))]);
    if (!shifts || !box?.playerByGameStats)
        throw new Error('could not load game');
    const input = (0, toiPost_js_1.toiChartInputFromGame)(shifts.data, { abbrev: box.homeTeam.abbrev, ...box.playerByGameStats.homeTeam }, { abbrev: box.awayTeam.abbrev, ...box.playerByGameStats.awayTeam }, teamCode);
    if (input === null || input === 'incomplete')
        throw new Error(`chart unavailable: ${input}`);
    (0, fs_1.writeFileSync)(out, (0, toiRender_js_1.renderPng)((0, toiRender_js_1.buildToiSvg)(input)));
    console.log(`wrote ${out}`);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=renderToiChart.js.map