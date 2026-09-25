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
exports.OFF_DAY_PHRASES = exports.DEFAULT_SEASON_END = exports.DEFAULT_SEASON_START = void 0;
exports.startDailyCardService = startDailyCardService;
exports.stopDailyCardService = stopDailyCardService;
exports.selectDailyCard = selectDailyCard;
exports.pickOffDayPhrase = pickOffDayPhrase;
exports.calculateSeasonSeries = calculateSeasonSeries;
exports.buildPreGameCard = buildPreGameCard;
exports.buildOffDayCard = buildOffDayCard;
const discord_js_1 = require("discord.js");
const luxon_1 = require("luxon");
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const queries_js_1 = require("../db/queries.js");
const goalCard_js_1 = require("./goalCard.js");
const milestoneWatch_js_1 = require("./milestoneWatch.js");
const standings_js_1 = require("./standings.js");
const logger = (0, pino_1.default)({ name: 'daily-card-service' });
const POLL_INTERVAL_MS = 60_000;
const DEFAULT_ZONE = 'America/Denver';
exports.DEFAULT_SEASON_START = '2026-09-29';
exports.DEFAULT_SEASON_END = '2027-04-10';
const CARD_COLOR = 0x006847;
let timer = null;
function startDailyCardService(client) {
    if (timer)
        return;
    logger.info('Starting daily card service');
    timer = setInterval(() => tick(client), POLL_INTERVAL_MS);
    tick(client);
}
function stopDailyCardService() {
    if (timer) {
        clearInterval(timer);
        timer = null;
        logger.info('Stopped daily card service');
    }
}
async function tick(client) {
    logger.debug('Daily card scheduler tick');
    for (const [guildId] of client.guilds.cache) {
        try {
            await processGuild(client, guildId);
        }
        catch (err) {
            logger.error({ err, guildId }, 'Error processing daily card for guild');
        }
    }
}
async function processGuild(client, guildId) {
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    if (!config?.gameday_channel_id || !config.daily_card_enabled)
        return;
    const zone = config.timezone || DEFAULT_ZONE;
    const now = luxon_1.DateTime.now().setZone(zone);
    const todayISO = now.toISODate();
    if (!todayISO)
        return;
    if (now.hour < config.daily_card_hour)
        return;
    if ((0, queries_js_1.hasDailyCardBeenPosted)(guildId, todayISO))
        return;
    const scheduleResponse = await nhlClient.getSchedule(config.primary_team);
    if (!scheduleResponse) {
        // Transient NHL API failure (fetchJson already retried 3x). Don't claim the day —
        // a genuinely empty/off-season schedule is handled below, but this isn't that; we
        // want to retry next tick instead of silently suppressing today's card.
        logger.warn({ guildId }, 'Schedule unavailable, will retry next tick');
        return;
    }
    const games = scheduleResponse.games ?? [];
    const window = {
        start: config.season_start || exports.DEFAULT_SEASON_START,
        end: config.season_end || exports.DEFAULT_SEASON_END,
    };
    const selection = selectDailyCard(games, todayISO, zone, window);
    if (selection.kind === 'none') {
        // Nothing to post (off-season), but claim the day so we don't refetch the schedule
        // on every tick until a real game shows up.
        (0, queries_js_1.markDailyCardPosted)(guildId, todayISO);
        return;
    }
    // Skip a stale pre-game card if the bot was down past puck drop — the game is already
    // live/final by the time we notice it. Still claim the day so we don't retry every tick.
    if (selection.kind === 'game' && selection.game.gameState !== 'FUT' && selection.game.gameState !== 'PRE') {
        (0, queries_js_1.markDailyCardPosted)(guildId, todayISO);
        logger.info({ guildId, gameState: selection.game.gameState }, 'Skipping stale pre-game card; game already underway');
        return;
    }
    // Claim before posting so a slow post (or a second overlapping tick) can't double-post.
    if (!(0, queries_js_1.markDailyCardPosted)(guildId, todayISO))
        return;
    try {
        const channel = await client.channels.fetch(config.gameday_channel_id);
        if (!channel || !channel.isTextBased()) {
            logger.error({ guildId, channelId: config.gameday_channel_id }, 'Gameday channel not found for daily card');
            return;
        }
        const guild = client.guilds.cache.get(guildId);
        let embed;
        if (selection.kind === 'game') {
            const standingsResponse = await nhlClient.getStandings();
            const milestoneLines = await loadMilestoneLines(selection.game, config.primary_team);
            // Only this season's standings — during preseason the NHL still serves last season's
            const standings = (0, standings_js_1.standingsForSeason)(standingsResponse, selection.game.season);
            embed = buildPreGameCard(selection.game, games, config.primary_team, standings, guild, milestoneLines);
        }
        else {
            const phrase = pickOffDayPhrase(todayISO);
            embed = buildOffDayCard(phrase, selection.nextGame, config.primary_team);
        }
        await channel.send({ embeds: [embed] });
        logger.info({ guildId, kind: selection.kind }, 'Daily card posted');
    }
    catch (err) {
        logger.error({ err, guildId }, 'Failed to post daily card');
    }
}
// Regular season only: the watched stats are regular-season totals. Never blocks the card.
async function loadMilestoneLines(game, primaryTeam) {
    if (game.gameType !== 2)
        return [];
    try {
        const players = await (0, milestoneWatch_js_1.loadWatchPlayers)(primaryTeam, game.season);
        return players ? (0, milestoneWatch_js_1.findUpcomingMilestones)(players) : [];
    }
    catch (err) {
        logger.warn({ err }, 'Milestone watch failed, posting card without it');
        return [];
    }
}
function selectDailyCard(games, todayISO, zone, window) {
    const gameToday = games.find(g => luxon_1.DateTime.fromISO(g.startTimeUTC, { zone: 'utc' }).setZone(zone).toISODate() === todayISO);
    if (gameToday) {
        return { kind: 'game', game: gameToday };
    }
    const inConfiguredWindow = window.start <= todayISO && todayISO <= window.end;
    const hasFuturePlayoffGame = games.some(g => g.gameType === 3 && g.gameDate >= todayISO);
    if (!inConfiguredWindow && !hasFuturePlayoffGame) {
        return { kind: 'none' };
    }
    const upcoming = games
        .filter(g => g.gameDate > todayISO)
        .sort((a, b) => (a.gameDate < b.gameDate ? -1 : a.gameDate > b.gameDate ? 1 : 0));
    return { kind: 'offday', nextGame: upcoming[0] };
}
exports.OFF_DAY_PHRASES = [
    'No game today. Touch grass.',
    'Off day. Go outside.',
    'No hockey tonight. Get a hobby.',
    'Rest day. Hydrate.',
    'Nothing on the schedule. Call your mom.',
    'No game today. Read a book or something.',
    'Day off. Stretch. Nap. Repeat.',
    'No puck drop tonight. Go for a walk.',
    "Off night. Do the dishes you've been avoiding.",
    "No game. Take a break. We'll be here tomorrow.",
];
function pickOffDayPhrase(todayISO) {
    const dayOfYear = luxon_1.DateTime.fromISO(todayISO).ordinal;
    return exports.OFF_DAY_PHRASES[dayOfYear % exports.OFF_DAY_PHRASES.length];
}
/** Season series (regular season only) for `primaryTeam` against `opponent`, from completed games. */
function calculateSeasonSeries(games, primaryTeam, opponent) {
    const record = { wins: 0, losses: 0, otLosses: 0 };
    for (const g of games) {
        if (g.gameType !== 2)
            continue;
        if (g.gameState !== 'FINAL' && g.gameState !== 'OFF')
            continue;
        const isHome = g.homeTeam.abbrev === primaryTeam;
        const isAway = g.awayTeam.abbrev === primaryTeam;
        if (!isHome && !isAway)
            continue;
        const opponentAbbrev = isHome ? g.awayTeam.abbrev : g.homeTeam.abbrev;
        if (opponentAbbrev !== opponent)
            continue;
        const primaryScore = isHome ? g.homeTeam.score : g.awayTeam.score;
        const opponentScore = isHome ? g.awayTeam.score : g.homeTeam.score;
        if (primaryScore == null || opponentScore == null)
            continue;
        if (primaryScore > opponentScore) {
            record.wins++;
        }
        else {
            const lastPeriodType = g.gameOutcome?.lastPeriodType;
            if (lastPeriodType === 'OT' || lastPeriodType === 'SO') {
                record.otLosses++;
            }
            else {
                record.losses++;
            }
        }
    }
    return record;
}
function formatSeasonSeries(record) {
    return `${record.wins}-${record.losses}-${record.otLosses}`;
}
// --- Embed builders ---
function formatStreak(standing) {
    if (!standing)
        return '';
    if (standing.streakCode === 'OT')
        return 'OT';
    return `${standing.streakCode}${standing.streakCount}`;
}
function formatRecordLine(abbrev, standing) {
    if (!standing)
        return null;
    return `**${abbrev}**: GP:${standing.gamesPlayed} W:${standing.wins} L:${standing.losses} OT:${standing.otLosses} PTS:${standing.points} S:${formatStreak(standing)}`;
}
function buildPreGameCard(game, seasonGames, primaryTeam, standings, guild, milestoneLines = []) {
    const homeEmoji = (0, goalCard_js_1.getTeamEmoji)(game.homeTeam.abbrev, guild);
    const awayEmoji = (0, goalCard_js_1.getTeamEmoji)(game.awayTeam.abbrev, guild);
    const lines = [`${awayEmoji} **${game.awayTeam.abbrev}** @ **${game.homeTeam.abbrev}** ${homeEmoji}`, ''];
    const homeStanding = standings?.find(s => s.teamAbbrev.default === game.homeTeam.abbrev);
    const awayStanding = standings?.find(s => s.teamAbbrev.default === game.awayTeam.abbrev);
    const awayRecordLine = formatRecordLine(game.awayTeam.abbrev, awayStanding);
    const homeRecordLine = formatRecordLine(game.homeTeam.abbrev, homeStanding);
    if (awayRecordLine)
        lines.push(awayRecordLine);
    if (homeRecordLine)
        lines.push(homeRecordLine);
    lines.push('');
    const unixSeconds = Math.floor(new Date(game.startTimeUTC).getTime() / 1000);
    lines.push(`**Puck drop:** <t:${unixSeconds}:t>`);
    lines.push(`**Venue:** ${game.venue.default}`);
    if (game.tvBroadcasts && game.tvBroadcasts.length > 0) {
        const networks = game.tvBroadcasts.map(tv => tv.network).join(', ');
        lines.push(`**TV:** ${networks}`);
    }
    const isHome = game.homeTeam.abbrev === primaryTeam;
    const isAway = game.awayTeam.abbrev === primaryTeam;
    if (isHome || isAway) {
        const opponent = isHome ? game.awayTeam.abbrev : game.homeTeam.abbrev;
        const series = calculateSeasonSeries(seasonGames, primaryTeam, opponent);
        const gamesPlayed = series.wins + series.losses + series.otLosses;
        if (gamesPlayed > 0) {
            lines.push(`**Season series:** ${formatSeasonSeries(series)}`);
        }
    }
    if (milestoneLines.length > 0) {
        lines.push('', '🎯 **Milestone watch**', ...milestoneLines);
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('Game day!')
        .setDescription(lines.join('\n'))
        .setColor(CARD_COLOR);
    const thumbnail = isHome ? game.homeTeam.logo : isAway ? game.awayTeam.logo : undefined;
    if (thumbnail)
        embed.setThumbnail(thumbnail);
    return embed;
}
function buildOffDayCard(phrase, nextGame, primaryTeam) {
    const lines = [phrase];
    if (nextGame) {
        const unixSeconds = Math.floor(new Date(nextGame.startTimeUTC).getTime() / 1000);
        lines.push('');
        lines.push(`**Next game:** ${nextGame.awayTeam.abbrev} @ ${nextGame.homeTeam.abbrev} — <t:${unixSeconds}:F>`);
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('No game today')
        .setDescription(lines.join('\n'))
        .setColor(CARD_COLOR);
    if (nextGame) {
        const isHome = nextGame.homeTeam.abbrev === primaryTeam;
        const isAway = nextGame.awayTeam.abbrev === primaryTeam;
        const thumbnail = isHome ? nextGame.homeTeam.logo : isAway ? nextGame.awayTeam.logo : undefined;
        if (thumbnail)
            embed.setThumbnail(thumbnail);
    }
    return embed;
}
//# sourceMappingURL=dailyCard.js.map