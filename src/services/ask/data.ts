import type { EmbedBuilder, Guild } from 'discord.js';
import type { GuildConfig } from '../../db/models.js';
import { loadFollowablePlayers, matchRosterPlayer } from '../follows.js';
import { lookupLastGame, lookupNextGame, lookupPlayer, lookupStandingsEmbed, seasonLabel } from '../teamLookups.js';
import { formatStatAnswer, playerNameCandidates, type AskIntent } from './intents.js';
import {
  formatEpisodeReply, formatSubstackReply, latestEpisode, latestSubstackPost, SUBSTACK_UNREACHABLE, YOUTUBE_UNREACHABLE,
} from './podcast.js';

export interface DataReply {
  content?: string;
  embeds?: EmbedBuilder[];
  logText: string; // what goes in ask_log.answer
}

const NHL_DOWN = 'The NHL API isn\'t answering. Try again in a bit.';

/**
 * Runs a tier-2 intent against the existing lookups. Returns null when the match turns out
 * not to be confident (e.g. the name isn't someone on the roster), so the caller falls
 * through to the LLM.
 */
export async function runDataIntent(intent: AskIntent, guild: Guild, config: GuildConfig | undefined): Promise<DataReply | null> {
  const teamCode = config?.primary_team ?? 'UTA';
  const timezone = config?.timezone ?? 'America/Denver';

  switch (intent.kind) {
    case 'next_game': {
      const r = await lookupNextGame(teamCode, timezone);
      if (r.kind === 'no_schedule') return { content: NHL_DOWN, logText: NHL_DOWN };
      if (r.kind === 'none') {
        const t = 'Nothing on the schedule. Enjoy the quiet.';
        return { content: t, logText: t };
      }
      return { embeds: [r.embed], logText: `[next game embed] ${r.game.awayTeam.abbrev} @ ${r.game.homeTeam.abbrev} ${r.game.startTimeUTC}` };
    }
    case 'standings': {
      const embed = await lookupStandingsEmbed(teamCode, intent.filter);
      if (!embed) return { content: NHL_DOWN, logText: NHL_DOWN };
      return { embeds: [embed], logText: `[standings embed${intent.filter ? ` ${intent.filter}` : ''}]` };
    }
    case 'last_game': {
      const r = await lookupLastGame(teamCode, config?.spoiler_mode ?? 'off', guild);
      if (r.kind === 'unavailable') return { content: NHL_DOWN, logText: NHL_DOWN };
      if (r.kind === 'none') {
        const t = 'No games played yet this season.';
        return { content: t, logText: t };
      }
      return { content: r.content, embeds: [r.embed], logText: `[final card] game ${r.game.id}` };
    }
    case 'player_stats': {
      // Only answer directly for someone on our roster; anyone else goes to the LLM (it can search the league)
      const roster = await loadFollowablePlayers(teamCode);
      if (!roster) return null;
      let playerId: number | null = null;
      for (const candidate of playerNameCandidates(intent.player)) {
        const m = matchRosterPlayer(candidate, roster);
        if (m.kind === 'match') {
          playerId = m.player.id;
          break;
        }
      }
      if (playerId === null) return null;
      const r = await lookupPlayer({ playerId });
      if (r.kind !== 'ok') return { content: NHL_DOWN, logText: NHL_DOWN };
      const line = intent.stat
        ? formatStatAnswer(r.name, r.stats.position, r.stats.featuredStats?.regularSeason?.subSeason, intent.stat, seasonLabel(r.stats.featuredStats?.season))
        : null;
      return { content: line ?? undefined, embeds: [r.embed], logText: line ?? `[player embed] ${r.name}` };
    }
    case 'latest_episode': {
      const item = await latestEpisode();
      const t = item ? formatEpisodeReply(item) : YOUTUBE_UNREACHABLE;
      return { content: t, logText: t };
    }
    case 'latest_substack': {
      const item = await latestSubstackPost();
      const t = item ? formatSubstackReply(item) : SUBSTACK_UNREACHABLE;
      return { content: t, logText: t };
    }
  }
}
