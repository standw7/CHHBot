"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createToolExecutor = createToolExecutor;
const statsLookup_js_1 = require("../statsLookup.js");
const teamLookups_js_1 = require("../teamLookups.js");
const podcast_js_1 = require("./podcast.js");
function str(input, key) {
    const v = input?.[key];
    return typeof v === 'string' ? v.slice(0, 80) : '';
}
function createToolExecutor(ctx) {
    return async (name, input) => {
        switch (name) {
            case 'get_upcoming_games': {
                const raw = input?.count;
                const count = Math.min(5, Math.max(1, typeof raw === 'number' ? Math.floor(raw) : 1));
                return (await (0, teamLookups_js_1.lookupUpcomingGames)(ctx.teamCode, ctx.timezone, count)) ?? 'Schedule unavailable (NHL API did not respond).';
            }
            case 'get_last_game': {
                const r = await (0, teamLookups_js_1.lookupLastGame)(ctx.teamCode, 'off');
                if (r.kind === 'none')
                    return 'No completed games yet this season.';
                if (r.kind === 'unavailable')
                    return 'Last game unavailable (NHL API did not respond).';
                return (0, teamLookups_js_1.embedToText)(r.embed, `Game date: ${r.game.gameDate}`);
            }
            case 'get_standings': {
                const scope = str(input, 'scope');
                const filter = scope === 'league' ? 'league' : scope === 'east' ? 'east' : scope === 'west' ? 'west' : undefined;
                const embed = await (0, teamLookups_js_1.lookupStandingsEmbed)(ctx.teamCode, filter);
                return embed ? (0, teamLookups_js_1.embedToText)(embed, `Our team: ${ctx.teamCode}. Columns: rank. team | GP | W-L-OT | PTS`) : 'Standings unavailable (NHL API did not respond).';
            }
            case 'get_player_stats': {
                const query = str(input, 'name').trim();
                if (!query)
                    return 'No player name given.';
                const r = await (0, teamLookups_js_1.lookupPlayer)(query);
                if (r.kind === 'not_found')
                    return `No NHL player found matching "${query}".`;
                if (r.kind === 'unavailable')
                    return `Stats for ${r.name} are unavailable right now.`;
                return (0, teamLookups_js_1.embedToText)(r.embed);
            }
            case 'get_team_stat_leaders': {
                const category = str(input, 'category').trim() || 'points';
                // Footer dropped: statsLookup's footer has a hardcoded season label; the data is the current season
                return (0, teamLookups_js_1.embedToText)(await (0, statsLookup_js_1.buildStatsEmbed)(ctx.teamCode, category), 'Current season, from the NHL API / MoneyPuck:', { footer: false });
            }
            case 'get_latest_clean_hits_episode': {
                const item = await (0, podcast_js_1.latestEpisode)();
                return item ? (0, podcast_js_1.formatEpisodeReply)(item) : `YouTube did not respond. Channel: ${podcast_js_1.CLEAN_HITS.youtube}`;
            }
            case 'get_latest_clean_hits_substack_post': {
                const item = await (0, podcast_js_1.latestSubstackPost)();
                return item ? (0, podcast_js_1.formatSubstackReply)(item) : `Substack did not respond. Address: ${podcast_js_1.CLEAN_HITS.substack}`;
            }
            default:
                return `Unknown tool: ${name}`;
        }
    };
}
//# sourceMappingURL=tools.js.map