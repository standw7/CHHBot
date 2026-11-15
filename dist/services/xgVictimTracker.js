"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appliesTo = appliesTo;
exports.checkVictimShots = checkVictimShots;
exports.debtPaymentMilestone = debtPaymentMilestone;
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../db/queries.js");
const media_js_1 = require("./media.js");
const deserveToWin_js_1 = require("./deserveToWin.js");
const moneyPuck_js_1 = require("./moneyPuck.js");
const xgVictim_js_1 = require("./xgVictim.js");
const logger = (0, pino_1.default)({ name: 'xg-victim' });
function appliesTo(game) {
    return game.teamCode === xgVictim_js_1.XG_VICTIM.team && (game.gameType === 2 || game.gameType === 3);
}
async function fetchGameCsv(gameId) {
    try {
        const res = await fetch((0, deserveToWin_js_1.gameDataUrl)(gameId), { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
        return res.ok ? await res.text() : null;
    }
    catch (err) {
        logger.warn({ err, gameId }, 'MoneyPuck game data fetch failed');
        return null;
    }
}
/** Latest elapsed game time in MoneyPuck's data — "now" as far as its (lagging) feed knows. */
function latestGameSeconds(csv) {
    const lines = csv.split('\n');
    const timeCol = lines[0]?.split(',').indexOf('time') ?? -1;
    let latest = 0;
    for (const line of lines.slice(1)) {
        const t = Number(line.split(',')[timeCol]);
        if (t > latest)
            latest = t;
    }
    return latest;
}
// Regular-season totals before tonight. Only for regular-season games: the debt is a regular-season stat.
async function seasonBefore(game) {
    if (game.gameType !== 2)
        return undefined;
    const skaters = await (0, moneyPuck_js_1.getMoneyPuckSkaters)(xgVictim_js_1.XG_VICTIM.team, Math.floor(game.season / 10000));
    const me = skaters?.find(s => Number(s.playerId) === xgVictim_js_1.XG_VICTIM.playerId);
    return me ? { xg: me.xGoals, goals: me.goals } : undefined;
}
/**
 * Checks MoneyPuck for the victim's new saved/missed shots. Each shot gets exactly one
 * roll (claimed in the DB), posting with probability postChance(xG): the card, then a
 * random meme from the victim's gif command.
 */
async function checkVictimShots(client, game, pbp, random = Math.random) {
    if (!appliesTo(game))
        return;
    const csv = await fetchGameCsv(game.gameId);
    if (!csv)
        return;
    const shots = (0, xgVictim_js_1.parseVictimShots)(csv, xgVictim_js_1.XG_VICTIM.team, xgVictim_js_1.XG_VICTIM.lastName);
    const now = latestGameSeconds(csv);
    for (const [i, shot] of shots.entries()) {
        if (shot.event === 'GOAL')
            continue; // goals get the debt banner on the real goal card
        if (game.gameType === 2 && shot.gameSeconds >= 3900)
            continue; // shootout
        if (!(0, queries_js_1.claimXgShot)(game.guildId, game.gameId, shot.id))
            continue;
        const age = now - shot.gameSeconds;
        const chance = (0, xgVictim_js_1.postChance)(shot.xg);
        if (age > xgVictim_js_1.MAX_SHOT_AGE_SECONDS) {
            logger.info({ shotId: shot.id, age }, 'Old xG-victim shot, recorded without posting');
            continue;
        }
        if (random() >= chance) {
            logger.info({ shotId: shot.id, xg: shot.xg, chance }, 'xG-victim shot rolled: no post');
            continue;
        }
        await postCard(client, game, shot, shots.slice(0, i + 1), pbp);
    }
}
async function postCard(client, game, shot, tonight, pbp) {
    try {
        const channel = await client.channels.fetch(game.channelId);
        if (!channel || !channel.isTextBased())
            return;
        const embed = (0, xgVictim_js_1.buildXgCard)({
            shot,
            tonight,
            season: await seasonBefore(game),
            gameType: game.gameType,
            quip: (0, xgVictim_js_1.pickQuip)(shot.xg),
            headshot: pbp.rosterSpots?.find(s => s.playerId === xgVictim_js_1.XG_VICTIM.playerId)?.headshot,
        });
        await channel.send({ embeds: [embed] });
        const memes = (0, queries_js_1.getGifEntries)(game.guildId, xgVictim_js_1.XG_VICTIM.memeKey);
        if (memes.length > 0) {
            await channel.send((0, media_js_1.buildMediaMessage)(memes[Math.floor(Math.random() * memes.length)]));
        }
        logger.info({ guildId: game.guildId, shotId: shot.id, xg: shot.xg }, 'xG-victim card posted');
    }
    catch (err) {
        logger.error({ err, shotId: shot.id }, 'Failed to post xG-victim card');
    }
}
/**
 * The banner for the victim's own goal card. goalsTonight counts this goal (from the NHL,
 * since MoneyPuck may not have it yet). Never throws: worst case is a banner without a number.
 */
async function debtPaymentMilestone(game, goalsTonight) {
    let owed;
    try {
        const season = await seasonBefore(game);
        const csv = season ? await fetchGameCsv(game.gameId) : null;
        if (season && csv) {
            const tonightXg = (0, xgVictim_js_1.parseVictimShots)(csv, xgVictim_js_1.XG_VICTIM.team, xgVictim_js_1.XG_VICTIM.lastName).reduce((sum, s) => sum + s.xg, 0);
            owed = (0, xgVictim_js_1.goalsOwed)(season, tonightXg, goalsTonight);
        }
    }
    catch (err) {
        logger.warn({ err }, 'Could not work out the xG debt for the goal card');
    }
    return { kind: 'debt_payment', label: (0, xgVictim_js_1.debtPaymentLabel)(owed), celebrate: true };
}
//# sourceMappingURL=xgVictimTracker.js.map