import { Client } from 'discord.js';
import type { Milestone } from './milestones.js';
import type { PlayByPlayResponse } from '../nhl/types.js';
export interface XgGame {
    guildId: string;
    gameId: number;
    gameType: number;
    season: number;
    teamCode: string;
    channelId: string;
}
export declare function appliesTo(game: Pick<XgGame, 'gameType' | 'teamCode'>): boolean;
/**
 * Checks MoneyPuck for the victim's new saved/missed shots. Each shot gets exactly one
 * roll (claimed in the DB), posting with probability postChance(xG): the card, then a
 * random meme from the victim's gif command.
 */
export declare function checkVictimShots(client: Client, game: XgGame, pbp: PlayByPlayResponse, random?: () => number): Promise<void>;
/**
 * The banner for the victim's own goal card. goalsTonight counts this goal (from the NHL,
 * since MoneyPuck may not have it yet). Never throws: worst case is a banner without a number.
 */
export declare function debtPaymentMilestone(game: Pick<XgGame, 'gameId' | 'gameType' | 'season'>, goalsTonight: number): Promise<Milestone>;
//# sourceMappingURL=xgVictimTracker.d.ts.map