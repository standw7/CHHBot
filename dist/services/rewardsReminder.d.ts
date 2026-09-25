import { Client, Guild, Role, TextChannel } from 'discord.js';
export declare const REWARDS_ROLE_NAME = "Rewards";
export declare const REWARDS_CHANNEL_NAME = "rewards";
export declare const REWARDS_PING_INTERVAL_MS: number;
export interface RewardsSchedule {
    anchorAt: number;
    lastSlot: number;
}
/**
 * Starting schedule for a game with no pings recorded yet.
 * Watched from the start: 0:00 is now (puck drop), and mark 0 pings immediately.
 * Joined late (bot restarted mid-game): 0:00 is the scheduled start and marks
 * already passed are skipped, so the next ping waits for the next mark.
 */
export declare function initialRewardsSchedule(watchedFromStart: boolean, scheduledStart: number, now: number): RewardsSchedule;
/**
 * Returns the mark to ping now, or null if none is due. If several marks passed
 * (e.g. during downtime) only the latest is returned, so it pings once.
 * Callers only invoke this while the game is LIVE, so nothing fires after FINAL.
 */
export declare function dueRewardsSlot(schedule: RewardsSchedule, now: number): number | null;
/**
 * Find the Rewards role (saved ID first, then by name, case-insensitive).
 * With `create`, makes the role if it doesn't exist. Saves the ID to guild config.
 */
export declare function resolveRewardsRole(guild: Guild, create: boolean): Promise<Role | null>;
/**
 * Read-only for the Rewards role, hidden from everyone else. Tusky and mod roles
 * (Manage Messages, excluding bot-managed roles) can see and post; admins bypass overwrites.
 */
export declare function rewardsChannelOverwrites(guild: Guild, role: Role): ({
    id: string;
    allow: bigint[];
} | {
    id: string;
    deny: bigint[];
    allow?: undefined;
} | {
    id: string;
    allow: bigint[];
    deny: bigint[];
})[];
/**
 * Find the #rewards channel (saved ID first, then by name). If missing, creates it
 * with rewardsChannelOverwrites(). An existing channel is used as-is.
 */
export declare function resolveRewardsChannel(guild: Guild, role: Role): Promise<TextChannel | null>;
/**
 * Called on every LIVE tick. Pings the Rewards role in #rewards at each 45-minute
 * mark (see initialRewardsSchedule for where 0:00 is). The schedule is persisted
 * per game so a bot restart resumes it instead of re-pinging.
 */
export declare function maybeSendRewardsReminder(client: Client, guildId: string, gameId: number, watchedFromStart: boolean, scheduledStart: number): Promise<void>;
//# sourceMappingURL=rewardsReminder.d.ts.map