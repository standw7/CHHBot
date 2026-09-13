import { EmbedBuilder, Guild } from 'discord.js';
import type { LandingGoal, LandingResponse, PbpTeam, Play } from '../nhl/types.js';
import { type SpoilerMode } from './spoiler.js';
import type { Milestone } from './milestones.js';
export interface GoalCardData {
    landingGoal?: LandingGoal;
    play: Play;
    homeTeam: PbpTeam;
    awayTeam: PbpTeam;
    scoringTeamAbbrev: string;
    scoringTeamLogo: string;
    guild?: Guild;
    primaryTeam?: string;
    milestones?: Milestone[];
    replayUrl?: string;
}
export declare function findReplayUrl(landing: LandingResponse, eventId: number): string | undefined;
export declare function getTeamEmoji(abbrev: string, guild?: Guild): string;
export declare function buildGoalCard(data: GoalCardData, spoilerMode: SpoilerMode): {
    content?: string;
    embed: EmbedBuilder;
};
//# sourceMappingURL=goalCard.d.ts.map