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
exports.MAX_FOLLOWS = void 0;
exports.matchRosterPlayer = matchRosterPlayer;
exports.loadFollowablePlayers = loadFollowablePlayers;
exports.buildFollowDm = buildFollowDm;
exports.sendFollowDms = sendFollowDms;
exports.buildFirstStarDm = buildFirstStarDm;
exports.sendFirstStarDms = sendFirstStarDms;
exports.checkMemberFollow = checkMemberFollow;
exports.buildHofFollowDm = buildHofFollowDm;
exports.sendHofFollowDms = sendHofFollowDms;
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const queries_js_1 = require("../db/queries.js");
const logger = (0, pino_1.default)({ name: 'follows' });
exports.MAX_FOLLOWS = 5;
function normalize(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function pick(players) {
    if (players.length === 1)
        return { kind: 'match', player: players[0] };
    if (players.length > 1)
        return { kind: 'ambiguous', players };
    return null;
}
/**
 * Match a query against players by jersey number (`9` / `#9`), exact full or last
 * name, then partial name. Case- and accent-insensitive; exact beats partial.
 */
function matchRosterPlayer(query, players) {
    const q = normalize(query);
    if (!q)
        return { kind: 'none' };
    const number = q.match(/^#?(\d+)$/);
    if (number) {
        return pick(players.filter(p => p.sweaterNumber === Number(number[1]))) ?? { kind: 'none' };
    }
    const full = (p) => normalize(`${p.firstName} ${p.lastName}`);
    const last = (p) => normalize(p.lastName);
    return (pick(players.filter(p => full(p) === q || last(p) === q)) ??
        pick(players.filter(p => full(p).includes(q) || last(p).startsWith(q))) ?? { kind: 'none' });
}
/** Current roster of `teamCode` as followable players, or null if unavailable. */
async function loadFollowablePlayers(teamCode) {
    const roster = await nhlClient.getRoster(teamCode);
    if (!roster)
        return null;
    return [...roster.forwards, ...roster.defensemen, ...roster.goalies].map(p => ({
        id: p.id,
        firstName: p.firstName.default,
        lastName: p.lastName.default,
        sweaterNumber: p.sweaterNumber,
    }));
}
const ORDINALS = ['1st', '2nd', '3rd'];
function periodLabel(number, periodType) {
    if (periodType === 'OT')
        return number > 4 ? `${number - 3}OT` : 'OT';
    return ORDINALS[number - 1] ?? `${number}th`;
}
/** DM text for one user and one goal, or null if they follow nobody on it (or it's a shootout goal). */
function buildFollowDm(input) {
    const { goal, followed, teamCode, homeAbbrev, awayAbbrev } = input;
    if (input.periodType === 'SO')
        return null;
    const lines = [];
    const scorer = goal.lastName.default;
    if (followed.has(goal.playerId))
        lines.push(`🚨 **${scorer}** scored!`);
    for (const a of goal.assists) {
        if (followed.has(a.playerId))
            lines.push(`🍎 **${a.lastName.default}** assisted on ${scorer}'s goal`);
    }
    if (lines.length === 0)
        return null;
    const ourHome = homeAbbrev === teamCode;
    const us = ourHome ? goal.homeScore : goal.awayScore;
    const them = ourHome ? goal.awayScore : goal.homeScore;
    const opponent = ourHome ? awayAbbrev : homeAbbrev;
    const time = goal.timeInPeriod.replace(/^0(\d:)/, '$1');
    let context = `${teamCode} ${us}-${them} ${opponent} · ${periodLabel(input.periodNumber, input.periodType)} ${time}`;
    if (input.cardUrl)
        context += ` · [Goal card](${input.cardUrl})`;
    lines.push(context);
    return lines.join('\n');
}
/**
 * DM every follower of the scorer/assisters on this goal. Each user+goal is claimed
 * in the DB first, so the second guild's tracker posting the same goal doesn't re-send.
 * Users with DMs closed are logged and skipped.
 */
async function sendFollowDms(client, gameId, input) {
    const involved = [input.goal.playerId, ...input.goal.assists.map(a => a.playerId)];
    const followers = (0, queries_js_1.getFollowersOf)(involved);
    for (const [userId, followed] of followers) {
        const text = buildFollowDm({ ...input, followed });
        if (!text)
            continue;
        if (!(0, queries_js_1.claimFollowDm)(userId, gameId, input.goal.eventId))
            continue;
        try {
            const user = await client.users.fetch(userId);
            await user.send(text);
            logger.info({ userId, gameId, eventId: input.goal.eventId }, 'Follow DM sent');
        }
        catch (error) {
            logger.warn({ error, userId, gameId }, 'Could not DM follower (DMs closed?)');
        }
    }
}
/** e.g. "⭐ **Keller** was named first star! UTA @ VGK · 2G 1A · [Three stars](url)". */
function buildFirstStarDm(lastName, stats, awayAbbrev, homeAbbrev, cardUrl) {
    let text = `⭐ **${lastName}** was named first star! ${awayAbbrev} @ ${homeAbbrev}`;
    if (stats)
        text += ` · ${stats}`;
    if (cardUrl)
        text += ` · [Three stars](${cardUrl})`;
    return text;
}
// follow_dms_sent key for a game's first-star DM (goal DMs use the goal's positive eventId)
const FIRST_STAR_EVENT_ID = -1;
/** DM followers of the game's first star. Deduped per user+game across guild trackers. */
async function sendFirstStarDms(client, gameId, playerId, lastName, stats, awayAbbrev, homeAbbrev, cardUrl) {
    const followers = (0, queries_js_1.getFollowersOf)([playerId]);
    const text = buildFirstStarDm(lastName, stats, awayAbbrev, homeAbbrev, cardUrl);
    for (const userId of followers.keys()) {
        if (!(0, queries_js_1.claimFollowDm)(userId, gameId, FIRST_STAR_EVENT_ID))
            continue;
        try {
            const user = await client.users.fetch(userId);
            await user.send(text);
            logger.info({ userId, gameId }, 'First star DM sent');
        }
        catch (error) {
            logger.warn({ error, userId, gameId }, 'Could not DM follower (DMs closed?)');
        }
    }
}
function checkMemberFollow(input) {
    if (input.followerId === input.targetId)
        return 'self';
    if (input.targetIsBot)
        return 'bot';
    if (input.targetOptedOut)
        return 'opted_out';
    if (input.alreadyFollowing)
        return 'already';
    if (input.currentCount >= exports.MAX_FOLLOWS)
        return 'limit';
    return 'ok';
}
function buildHofFollowDm(memberName, guildName, hofUrl) {
    return `🏆 **${memberName}**'s post made the Hall of Fame in ${guildName}! [See it](${hofUrl})`;
}
/** DM everyone in this guild who follows the author of a newly inducted HoF post. */
async function sendHofFollowDms(client, guildId, guildName, authorId, authorName, hofUrl) {
    const text = buildHofFollowDm(authorName, guildName, hofUrl);
    for (const userId of (0, queries_js_1.getMemberFollowers)(guildId, authorId)) {
        try {
            const user = await client.users.fetch(userId);
            await user.send(text);
            logger.info({ userId, guildId, authorId }, 'HoF follow DM sent');
        }
        catch (error) {
            logger.warn({ error, userId, guildId }, 'Could not DM follower (DMs closed?)');
        }
    }
}
//# sourceMappingURL=follows.js.map