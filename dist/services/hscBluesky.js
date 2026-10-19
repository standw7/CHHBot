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
exports.isTeamImpactCard = isTeamImpactCard;
exports.parseImpactCards = parseImpactCards;
exports.buildImpactCardEmbed = buildImpactCardEmbed;
exports.planHscPoll = planHscPoll;
exports.latestImpactCard = latestImpactCard;
exports.startHscWatcher = startHscWatcher;
exports.stopHscWatcher = stopHscWatcher;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const database_js_1 = require("../db/database.js");
const queries_js_1 = require("../db/queries.js");
const toiPost_js_1 = require("./toiPost.js");
const logger = (0, pino_1.default)({ name: 'hsc-bluesky' });
const FEED_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=hockeystatcards.com&limit=';
const POLL_LIMIT = 30; // every 5 min
const LOOKBACK_LIMIT = 100; // !hsc last: a busy night has ~16 cards
const POLL_INTERVAL_MS = 5 * 60_000;
function isTeamImpactCard(text, teamName) {
    return text.includes(`Game Score Impact Card for ${teamName}`);
}
/** HSC's own (not reposted, not reply) image posts of the team's Game Score Impact Card, feed order. */
function parseImpactCards(feed, teamName) {
    const items = feed?.feed;
    if (!Array.isArray(items))
        return [];
    const cards = [];
    for (const it of items) {
        const post = it.post;
        const text = post?.record?.text ?? '';
        const imageUrl = post?.embed?.$type === 'app.bsky.embed.images#view' ? post.embed.images?.[0]?.fullsize : undefined;
        if (it.reason || post?.record?.reply || !post?.uri || !imageUrl || !isTeamImpactCard(text, teamName))
            continue;
        cards.push({ uri: post.uri, rkey: post.uri.split('/').pop() ?? '', text, imageUrl, createdAt: post.record?.createdAt ?? '' });
    }
    return cards;
}
function buildImpactCardEmbed(post) {
    const date = post.text.match(/on (\d{4}-\d{2}-\d{2})/)?.[1];
    return new discord_js_1.EmbedBuilder()
        .setTitle(`📊 Game Score Impact Card${date ? ` · ${date}` : ''}`)
        .setDescription(`[via HockeyStatCards](https://bsky.app/profile/hockeystatcards.com/post/${post.rkey})`)
        .setImage(post.imageUrl)
        .setColor(0x006847);
}
/**
 * What one poll should do: post each unseen card to the guilds of its team (oldest first),
 * and mark every post in the feed seen, so cards from before a guild was enabled never backfill.
 */
function planHscPoll(feed, guildsByTeamName, isSeen) {
    const post = [];
    for (const [teamName, guildIds] of guildsByTeamName) {
        for (const card of parseImpactCards(feed, teamName).reverse()) {
            if (!isSeen(card.uri))
                post.push({ card, guildIds });
        }
    }
    const items = feed?.feed ?? [];
    return { post, markSeen: items.flatMap(it => (it.post?.uri ? [it.post.uri] : [])) };
}
async function fetchFeed(limit) {
    try {
        const res = await fetch(FEED_URL + limit, { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
        return res.ok ? await res.json() : null;
    }
    catch (error) {
        logger.warn({ error }, 'Bluesky feed fetch failed');
        return null;
    }
}
async function teamFullName(teamCode) {
    const standings = await nhlClient.getStandings();
    return standings?.standings.find(s => s.teamAbbrev.default === teamCode)?.teamName.default ?? null;
}
async function latestImpactCard(teamName) {
    const feed = await fetchFeed(LOOKBACK_LIMIT);
    return feed ? parseImpactCards(feed, teamName)[0] ?? null : null;
}
async function poll(client) {
    const feed = await fetchFeed(POLL_LIMIT);
    if (!feed)
        return;
    // First run: remember what's already there so old cards aren't backfilled
    if (!(0, queries_js_1.hasAnyHscPostSeen)()) {
        const items = feed.feed ?? [];
        for (const it of items)
            if (it.post?.uri)
                (0, queries_js_1.markHscPostSeen)(it.post.uri);
        logger.info({ count: items.length }, 'Seeded HSC Bluesky posts');
        return;
    }
    const enabled = (0, database_js_1.getDb)().prepare('SELECT guild_id FROM guild_config WHERE hsc_charts_enabled = 1').all()
        .map(r => r.guild_id)
        .filter(id => client.guilds.cache.has(id));
    const byTeam = new Map();
    for (const guildId of enabled) {
        const team = (0, queries_js_1.getGuildConfig)(guildId)?.primary_team ?? 'UTA';
        byTeam.set(team, [...(byTeam.get(team) ?? []), guildId]);
    }
    const guildsByTeamName = new Map();
    for (const [team, guildIds] of byTeam) {
        const teamName = await teamFullName(team);
        if (!teamName)
            return; // standings unavailable: retry next poll without marking anything seen
        guildsByTeamName.set(teamName, guildIds);
    }
    const plan = planHscPoll(feed, guildsByTeamName, queries_js_1.isHscPostSeen);
    for (const { card, guildIds } of plan.post) {
        if (!(0, queries_js_1.markHscPostSeen)(card.uri))
            continue; // claim before posting
        for (const guildId of guildIds)
            await (0, toiPost_js_1.postToChannels)(client, guildId, { embeds: [buildImpactCardEmbed(card)] });
        logger.info({ uri: card.uri, guildIds }, 'Impact card posted');
    }
    for (const uri of plan.markSeen)
        (0, queries_js_1.markHscPostSeen)(uri);
}
let timer = null;
function startHscWatcher(client) {
    if (timer)
        return;
    const run = () => poll(client).catch(error => logger.error({ error }, 'HSC watcher error'));
    run();
    timer = setInterval(run, POLL_INTERVAL_MS);
}
function stopHscWatcher() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
//# sourceMappingURL=hscBluesky.js.map