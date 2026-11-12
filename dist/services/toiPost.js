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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatToi = formatToi;
exports.toiChartInputFromGame = toiChartInputFromGame;
exports.toiChartTitle = toiChartTitle;
exports.pickLatestCompletedGame = pickLatestCompletedGame;
exports.latestCompletedGameId = latestCompletedGameId;
exports.loadToiChart = loadToiChart;
exports.toiMessage = toiMessage;
exports.postToChannels = postToChannels;
const discord_js_1 = require("discord.js");
const luxon_1 = require("luxon");
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const queries_js_1 = require("../db/queries.js");
const toiRender_js_1 = require("./toiRender.js");
const toiChart_js_1 = require("./toiChart.js");
const toiHtmlReport_js_1 = require("./toiHtmlReport.js");
const logger = (0, pino_1.default)({ name: 'toi-post' });
function toSeconds(mmss) {
    const [m, s] = mmss.split(':').map(Number);
    return m * 60 + s;
}
/** Boxscore TOI "08:12" -> "8:12". */
function formatToi(mmss) {
    return mmss.replace(/^0(?=\d:)/, '');
}
function chartPlayers(team) {
    return [
        ...team.forwards.map(p => ({ id: p.playerId, label: p.name.default, position: 'F', toi: formatToi(p.toi) })),
        ...team.defense.map(p => ({ id: p.playerId, label: p.name.default, position: 'D', toi: formatToi(p.toi) })),
    ];
}
/**
 * Chart input for `teamCode` (rows) vs its opponent (columns), or null if the team isn't
 * in this game, or 'incomplete' while shift data doesn't yet match the boxscore.
 */
function toiChartInputFromGame(rows, home, away, teamCode) {
    const us = home.abbrev === teamCode ? home : away.abbrev === teamCode ? away : null;
    if (!us)
        return null;
    const them = us === home ? away : home;
    const shifts = (0, toiChart_js_1.normalizeShifts)(rows);
    // Goalies too: a 5v5 second needs one goalie per side, so a missing goalie shift would shorten the chart
    const everyone = [home, away].flatMap(t => [...t.forwards, ...t.defense, ...t.goalies]);
    const boxToi = new Map(everyone.map(p => [p.playerId, toSeconds(p.toi)]));
    if (!(0, toiChart_js_1.isShiftDataComplete)(shifts, boxToi, (0, toiChart_js_1.hasOpenShifts)(rows)))
        return 'incomplete';
    const goalieIds = new Set([...home.goalies, ...away.goalies].map(g => g.playerId));
    const five = (0, toiChart_js_1.computeFiveOnFive)(shifts, goalieIds, us.abbrev, them.abbrev);
    const ours = (0, toiChart_js_1.orderPlayers)(chartPlayers(us), five);
    const theirs = (0, toiChart_js_1.orderPlayers)(chartPlayers(them), five);
    return {
        rows: [...ours.forwards, ...ours.defense],
        cols: [...theirs.forwards, ...theirs.defense],
        rowDividerAfter: ours.forwards.length,
        colDividerAfter: theirs.forwards.length,
        seconds: (rowId, colId) => five.against.get(`${rowId}-${colId}`) ?? 0,
        teamCode,
    };
}
function toiChartTitle(awayAbbrev, homeAbbrev, gameDate) {
    return `⏱️ Time against opponents · ${awayAbbrev} @ ${homeAbbrev} · ${luxon_1.DateTime.fromISO(gameDate).toFormat('LLL d')}`;
}
/** Latest finished regular-season or playoff game, or null. */
function pickLatestCompletedGame(games) {
    const done = games
        .filter(g => (g.gameType === 2 || g.gameType === 3) && (g.gameState === 'OFF' || g.gameState === 'FINAL'))
        .sort((a, b) => b.startTimeUTC.localeCompare(a.startTimeUTC));
    return done[0]?.id ?? null;
}
async function latestCompletedGameId(teamCode) {
    const schedule = await nhlClient.getSchedule(teamCode);
    return schedule ? pickLatestCompletedGame(schedule.games ?? []) : null;
}
/**
 * Fetch, check and render. null if the game can't be loaded or doesn't involve the team.
 * Uses the shiftcharts API, falling back to the HTML shift reports when the API's data
 * is missing or incomplete (the API is never populated for some games).
 */
async function loadToiChart(gameId, teamCode) {
    const [shifts, box] = await Promise.all([nhlClient.getShiftChart(gameId), nhlClient.getBoxscore(gameId)]);
    if (!box?.playerByGameStats)
        return null;
    const home = { abbrev: box.homeTeam.abbrev, ...box.playerByGameStats.homeTeam };
    const away = { abbrev: box.awayTeam.abbrev, ...box.playerByGameStats.awayTeam };
    let input = shifts ? toiChartInputFromGame(shifts.data, home, away, teamCode) : 'incomplete';
    if (input === 'incomplete' || (shifts?.data.length ?? 0) === 0) {
        const everyone = (t) => [...t.forwards, ...t.defense, ...t.goalies];
        const rows = await (0, toiHtmlReport_js_1.fetchShiftReports)(gameId, { abbrev: home.abbrev, players: everyone(home) }, { abbrev: away.abbrev, players: everyone(away) });
        if (rows && rows.length > 0) {
            const fromReports = toiChartInputFromGame(rows, home, away, teamCode);
            if (fromReports !== 'incomplete') {
                if (fromReports)
                    logger.info({ gameId }, 'Using HTML shift reports for TOI chart');
                input = fromReports;
            }
        }
    }
    if (input === null || input === 'incomplete')
        return input;
    return {
        png: (0, toiRender_js_1.renderPng)((0, toiRender_js_1.buildToiSvg)(input)),
        title: toiChartTitle(box.awayTeam.abbrev, box.homeTeam.abbrev, box.gameDate ?? ''),
    };
}
function toiMessage(chart, gameId) {
    return { content: `**${chart.title}**`, files: [new discord_js_1.AttachmentBuilder(chart.png, { name: `toi-${gameId}.png` })] };
}
/** Send to the guild's news and gameday channels (whichever are configured). */
async function postToChannels(client, guildId, payload) {
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    for (const channelId of [config?.news_channel_id, config?.gameday_channel_id]) {
        if (!channelId)
            continue;
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel?.isTextBased())
                await channel.send(payload);
        }
        catch (error) {
            logger.error({ error, guildId, channelId }, 'Failed to post chart');
        }
    }
}
//# sourceMappingURL=toiPost.js.map