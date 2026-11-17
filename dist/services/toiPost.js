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
exports.linesChartTitle = linesChartTitle;
exports.pickLatestCompletedGame = pickLatestCompletedGame;
exports.latestCompletedGameId = latestCompletedGameId;
exports.loadToiChart = loadToiChart;
exports.toiMessage = toiMessage;
exports.linesMessage = linesMessage;
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
/** Sizes of consecutive groups of `size` (the last one may be short), as orderPlayers builds them. */
function chunkSizes(count, size) {
    const out = [];
    for (let left = count; left > 0; left -= size)
        out.push(Math.min(size, left));
    return out;
}
/**
 * Chart inputs for `teamCode`: time against its opponent (our rows × their columns) and our
 * line pairings (our skaters × our skaters). null if the team isn't in this game, or
 * 'incomplete' while shift data doesn't yet match the boxscore.
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
    // Our rows: forwards, then defense, each sorted by total game TOI (the number on the right edge), most first
    const byToi = (players) => [...players].sort((a, b) => (boxToi.get(b.id) ?? 0) - (boxToi.get(a.id) ?? 0));
    return {
        against: {
            rows: [...byToi(ours.forwards), ...byToi(ours.defense)],
            cols: [...theirs.forwards, ...theirs.defense],
            rowDividerAfter: ours.forwards.length,
            colDividerAfter: theirs.forwards.length,
            seconds: (rowId, colId) => five.against.get(`${rowId}-${colId}`) ?? 0,
            teamCode,
        },
        // Line order as grouped (not by TOI) so trios and pairs sit as blocks on the diagonal
        lines: {
            players: [...ours.forwards, ...ours.defense],
            dividerAfter: ours.forwards.length,
            blocks: [...chunkSizes(ours.forwards.length, 3), ...chunkSizes(ours.defense.length, 2)],
            together: (a, b) => five.together.get(`${Math.min(a, b)}-${Math.max(a, b)}`) ?? 0,
            toi: id => five.toi.get(id) ?? 0,
            teamCode,
        },
    };
}
function matchup(awayAbbrev, homeAbbrev, gameDate) {
    return `${awayAbbrev} @ ${homeAbbrev} · ${luxon_1.DateTime.fromISO(gameDate).toFormat('LLL d')}`;
}
function toiChartTitle(awayAbbrev, homeAbbrev, gameDate) {
    return `⏱️ Time against opponents · ${matchup(awayAbbrev, homeAbbrev, gameDate)}`;
}
function linesChartTitle(awayAbbrev, homeAbbrev, gameDate) {
    return `🤝 Line combinations · ${matchup(awayAbbrev, homeAbbrev, gameDate)}`;
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
 * Fetch, check and render both charts. null if the game can't be loaded or doesn't involve the team.
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
    const [awayAbbrev, homeAbbrev, date] = [box.awayTeam.abbrev, box.homeTeam.abbrev, box.gameDate ?? ''];
    return {
        against: { png: (0, toiRender_js_1.renderPng)((0, toiRender_js_1.buildToiSvg)(input.against)), title: toiChartTitle(awayAbbrev, homeAbbrev, date) },
        lines: { png: (0, toiRender_js_1.renderPng)((0, toiRender_js_1.buildLinesSvg)(input.lines)), title: linesChartTitle(awayAbbrev, homeAbbrev, date) },
    };
}
/** One message, both charts: titles in image order. */
function toiMessage(charts, gameId) {
    return {
        content: `**${charts.against.title}**`,
        files: [new discord_js_1.AttachmentBuilder(charts.against.png, { name: `toi-${gameId}.png` })],
    };
}
/** Line combinations matrix — posted to the news channel only, not gameday. */
function linesMessage(charts, gameId) {
    return {
        content: `**${charts.lines.title}**`,
        files: [new discord_js_1.AttachmentBuilder(charts.lines.png, { name: `lines-${gameId}.png` })],
    };
}
/** Send to the guild's news and gameday channels (whichever are configured). */
async function postToChannels(client, guildId, payload, channels = 'news+gameday') {
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const ids = channels === 'news' ? [config?.news_channel_id] : [config?.news_channel_id, config?.gameday_channel_id];
    for (const channelId of ids) {
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