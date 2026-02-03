export interface GuildConfig {
  guild_id: string;
  primary_team: string;
  gameday_channel_id: string | null;
  hof_channel_id: string | null;
  bot_commands_channel_id: string | null;
  news_channel_id: string | null;
  spoiler_delay_seconds: number;
  spoiler_mode: 'off' | 'wrap_scores' | 'minimal_embed';
  command_mode: 'slash_only' | 'slash_plus_prefix';
  link_fix_enabled: number; // 1 = on, 0 = off
  timezone: string;
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
  inducted_at: string;
}
