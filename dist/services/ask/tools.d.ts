import type { ToolExecutor } from './llm.js';
import { type Nickname } from './nicknames.js';
export interface ToolContext {
    teamCode: string;
    timezone: string;
    /** Player nicknames; get_player_stats maps one to the real name if the model passes it through. */
    nicknames?: readonly Nickname[];
    /** This guild's gif keys with item counts; list_gif_commands returns them. */
    gifKeys?: () => {
        key: string;
        count: number;
    }[];
}
export declare function createToolExecutor(ctx: ToolContext): ToolExecutor;
//# sourceMappingURL=tools.d.ts.map