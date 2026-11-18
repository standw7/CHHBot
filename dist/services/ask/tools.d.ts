import type { ToolExecutor } from './llm.js';
export interface ToolContext {
    teamCode: string;
    timezone: string;
}
export declare function createToolExecutor(ctx: ToolContext): ToolExecutor;
//# sourceMappingURL=tools.d.ts.map