"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDataIntent = runDataIntent;
const follows_js_1 = require("../follows.js");
const teamLookups_js_1 = require("../teamLookups.js");
const intents_js_1 = require("./intents.js");
const podcast_js_1 = require("./podcast.js");
const NHL_DOWN = 'The NHL API isn\'t answering. Try again in a bit.';
/**
 * Runs a tier-2 intent against the existing lookups. Returns null when the match turns out
 * not to be confident (e.g. the name isn't someone on the roster), so the caller falls
 * through to the LLM.
 */
async function runDataIntent(intent, guild, config) {
    const teamCode = config?.primary_team ?? 'UTA';
    const timezone = config?.timezone ?? 'America/Denver';
    switch (intent.kind) {
        case 'next_game': {
            const r = await (0, teamLookups_js_1.lookupNextGame)(teamCode, timezone);
            if (r.kind === 'no_schedule')
                return { content: NHL_DOWN, logText: NHL_DOWN };
            if (r.kind === 'none') {
                const t = 'Nothing on the schedule. Enjoy the quiet.';
                return { content: t, logText: t };
            }
            return { embeds: [r.embed], logText: `[next game embed] ${r.game.awayTeam.abbrev} @ ${r.game.homeTeam.abbrev} ${r.game.startTimeUTC}` };
        }
        case 'standings': {
            const embed = await (0, teamLookups_js_1.lookupStandingsEmbed)(teamCode, intent.filter);
            if (!embed)
                return { content: NHL_DOWN, logText: NHL_DOWN };
            return { embeds: [embed], logText: `[standings embed${intent.filter ? ` ${intent.filter}` : ''}]` };
        }
        case 'last_game': {
            const r = await (0, teamLookups_js_1.lookupLastGame)(teamCode, config?.spoiler_mode ?? 'off', guild);
            if (r.kind === 'unavailable')
                return { content: NHL_DOWN, logText: NHL_DOWN };
            if (r.kind === 'none') {
                const t = 'No games played yet this season.';
                return { content: t, logText: t };
            }
            return { content: r.content, embeds: [r.embed], logText: `[final card] game ${r.game.id}` };
        }
        case 'player_stats': {
            // Only answer directly for someone on our roster; anyone else goes to the LLM (it can search the league)
            const roster = await (0, follows_js_1.loadFollowablePlayers)(teamCode);
            if (!roster)
                return null;
            let playerId = null;
            for (const candidate of (0, intents_js_1.playerNameCandidates)(intent.player)) {
                const m = (0, follows_js_1.matchRosterPlayer)(candidate, roster);
                if (m.kind === 'match') {
                    playerId = m.player.id;
                    break;
                }
            }
            if (playerId === null)
                return null;
            const r = await (0, teamLookups_js_1.lookupPlayer)({ playerId });
            if (r.kind !== 'ok')
                return { content: NHL_DOWN, logText: NHL_DOWN };
            const line = intent.stat
                ? (0, intents_js_1.formatStatAnswer)(r.name, r.stats.position, r.stats.featuredStats?.regularSeason?.subSeason, intent.stat, (0, teamLookups_js_1.seasonLabel)(r.stats.featuredStats?.season))
                : null;
            return { content: line ?? undefined, embeds: [r.embed], logText: line ?? `[player embed] ${r.name}` };
        }
        case 'latest_episode': {
            const item = await (0, podcast_js_1.latestEpisode)();
            const t = item ? (0, podcast_js_1.formatEpisodeReply)(item) : podcast_js_1.YOUTUBE_UNREACHABLE;
            return { content: t, logText: t };
        }
        case 'latest_substack': {
            const item = await (0, podcast_js_1.latestSubstackPost)();
            const t = item ? (0, podcast_js_1.formatSubstackReply)(item) : podcast_js_1.SUBSTACK_UNREACHABLE;
            return { content: t, logText: t };
        }
    }
}
//# sourceMappingURL=data.js.map