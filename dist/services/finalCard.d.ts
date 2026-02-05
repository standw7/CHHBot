import { EmbedBuilder, Guild } from 'discord.js';
import type { BoxscoreResponse } from '../nhl/types.js';
import { type SpoilerMode } from './spoiler.js';
export declare function buildFinalCard(boxscore: BoxscoreResponse, spoilerMode: SpoilerMode, guild?: Guild): {
    content?: string;
    embed: EmbedBuilder;
};
//# sourceMappingURL=finalCard.d.ts.map