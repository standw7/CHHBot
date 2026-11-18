export interface GuildConfig {
  guild_id: string;
  primary_team: string;
  gameday_channel_id: string | null;
  hof_channel_id: string | null;
  bot_commands_channel_id: string | null;
  news_channel_id: string | null;
  gameday_role_id: string | null;
  rewards_role_id: string | null;
  rewards_channel_id: string | null;
  hsc_charts_enabled: number; // post Game Score Impact Card + TOI chart after games
  spoiler_delay_seconds: number;
  spoiler_mode: 'off' | 'wrap_scores' | 'minimal_embed';
  command_mode: 'slash_only' | 'slash_plus_prefix';
  link_fix_enabled: number; // 1 = on, 0 = off
  timezone: string;
  hof_threshold: number; // minimum reactions needed for HoF induction
  daily_card_enabled: number; // 1 = on, 0 = off
  daily_card_hour: number; // 0-23, guild-local hour to post the daily card
  season_start: string; // ISO YYYY-MM-DD, first day of the "in season" off-day card window
  season_end: string; // ISO YYYY-MM-DD, last day of the "in season" off-day card window
  gif_contributor_role_id: string | null; // members with this role can add/remove gifs
  gif_log_channel_id: string | null; // gif add/remove/delete/rename actions are posted here
  tomato_channel_id: string | null; // Tomato Town: messages with enough 🍅 reactions are reposted here
  tomato_threshold: number; // 🍅 reactions needed for Tomato Town
  ask_enabled: number; // 1 = Ask Tusky answers @mentions, 0 = off
}

export interface FeedSource {
  id: number;
  guild_id: string;
  url: string;
  label: string;
  last_item_id: string | null;
  added_by: string;
  created_at: string;
}

export interface GifCommand {
  id: number;
  guild_id: string;
  key: string;
  url: string;
  added_by: string;
  created_at: string;
  file_path: string | null; // saved copy under media/ (null = posted as a link)
}

export interface PostedGoal {
  id: number;
  guild_id: string;
  game_id: number;
  event_id: number;
  posted_at: string;
}

export interface PostedFinal {
  guild_id: string;
  game_id: number;
  posted_at: string;
}

export interface HofMessage {
  id: number;
  guild_id: string;
  original_message_id: string;
  original_channel_id: string;
  hof_message_id: string | null;
  hof_channel_id: string | null;
  hof_followup_id: string | null;
  hof_reply_followup_id: string | null; // links from the replied-to message (third post)
  inducted_at: string;
}

export interface DailyCardPosted {
  guild_id: string;
  date: string; // YYYY-MM-DD in the guild's timezone
}

export interface Reminder {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  message: string;
  fire_at: string;
  dm: number;
  created_at: string;
}

export type AskTier = 'preset' | 'data' | 'llm' | 'deflect' | 'capped' | 'error';

export interface AskPreset {
  id: number;
  guild_id: string;
  trigger: string; // normalized
  response: string;
  exact_only: number; // 1 = only when the whole message is the trigger
  created_by: string | null;
  created_at: string;
}

export interface AskLogEntry {
  id: number;
  created_at: string; // ISO timestamp
  day: string; // YYYY-MM-DD in America/Denver (daily caps)
  guild_id: string;
  channel_id: string | null;
  user_id: string;
  question: string;
  tier: AskTier;
  answer: string | null;
  llm_used: number; // 1 = an API call was made (counts toward caps)
  input_tokens: number;
  output_tokens: number;
  reply_message_id: string | null;
}
