import { buildStatsEmbed } from '../statsLookup.js';
import {
  embedToText, lookupLastGame, lookupPlayer, lookupStandingsEmbed, lookupUpcomingGames,
} from '../teamLookups.js';
import {
  CLEAN_HITS, formatEpisodeReply, formatSubstackReply, latestEpisode, latestSubstackPost,
} from './podcast.js';
import type { ToolExecutor } from './llm.js';

// LLM tool implementations: thin wrappers over the same lookups as !next/!standings/!player/!stats
// and the tier-2 intents, flattened to text.

export interface ToolContext {
  teamCode: string;
  timezone: string;
}

function str(input: unknown, key: string): string {
  const v = (input as Record<string, unknown> | null)?.[key];
  return typeof v === 'string' ? v.slice(0, 80) : '';
}

export function createToolExecutor(ctx: ToolContext): ToolExecutor {
  return async (name, input) => {
    switch (name) {
      case 'get_upcoming_games': {
        const raw = (input as Record<string, unknown> | null)?.count;
        const count = Math.min(5, Math.max(1, typeof raw === 'number' ? Math.floor(raw) : 1));
        return (await lookupUpcomingGames(ctx.teamCode, ctx.timezone, count)) ?? 'Schedule unavailable (NHL API did not respond).';
      }
      case 'get_last_game': {
        const r = await lookupLastGame(ctx.teamCode, 'off');
        if (r.kind === 'none') return 'No completed games yet this season.';
        if (r.kind === 'unavailable') return 'Last game unavailable (NHL API did not respond).';
        return embedToText(r.embed, `Game date: ${r.game.gameDate}`);
      }
      case 'get_standings': {
        const scope = str(input, 'scope');
        const filter = scope === 'league' ? 'league' : scope === 'east' ? 'east' : scope === 'west' ? 'west' : undefined;
        const embed = await lookupStandingsEmbed(ctx.teamCode, filter);
        return embed ? embedToText(embed, `Our team: ${ctx.teamCode}. Columns: rank. team | GP | W-L-OT | PTS`) : 'Standings unavailable (NHL API did not respond).';
      }
      case 'get_player_stats': {
        const query = str(input, 'name').trim();
        if (!query) return 'No player name given.';
        const r = await lookupPlayer(query);
        if (r.kind === 'not_found') return `No NHL player found matching "${query}".`;
        if (r.kind === 'unavailable') return `Stats for ${r.name} are unavailable right now.`;
        return embedToText(r.embed);
      }
      case 'get_team_stat_leaders': {
        const category = str(input, 'category').trim() || 'points';
        // Footer dropped: statsLookup's footer has a hardcoded season label; the data is the current season
        return embedToText(await buildStatsEmbed(ctx.teamCode, category), 'Current season, from the NHL API / MoneyPuck:', { footer: false });
      }
      case 'get_latest_clean_hits_episode': {
        const item = await latestEpisode();
        return item ? formatEpisodeReply(item) : `YouTube did not respond. Channel: ${CLEAN_HITS.youtube}`;
      }
      case 'get_latest_clean_hits_substack_post': {
        const item = await latestSubstackPost();
        return item ? formatSubstackReply(item) : `Substack did not respond. Address: ${CLEAN_HITS.substack}`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  };
}
