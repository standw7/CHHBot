import Anthropic from '@anthropic-ai/sdk';
import { type Nickname } from './nicknames.js';
export declare const ASK_MODEL = "claude-haiku-5-5";
export declare const MAX_TOKENS = 1024;
export declare const MAX_API_CALLS = 3;
export declare const LLM_TIMEOUT_MS = 20000;
export declare const MAX_ANSWER_CHARS = 600;
/** Pull the named `## ` sections out of a markdown doc, in document order. */
export declare function extractSections(markdown: string, titles: readonly string[]): string;
export declare function loadCommandReference(): string;
export declare function loadKnowledge(): string;
/**
 * `nicknames` come from the guild's ask_nicknames table; formatNicknameList sorts them, so the
 * prompt (and its cache entry) only changes when an admin edits the list.
 */
export declare function buildSystemPrompt(knowledge: string, nicknames?: readonly Nickname[], commandRef?: string, webSearch?: boolean): string;
export declare const ANSWER_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly on_topic: {
            readonly type: "boolean";
            readonly description: "True if the question is about the Utah Mammoth, NHL/hockey, or the Clean Hits Hockey podcast.";
        };
        readonly answer: {
            readonly type: "string";
            readonly description: "The reply to post (at most 3 short sentences). Empty when off topic.";
        };
    };
    readonly required: readonly ["on_topic", "answer"];
    readonly additionalProperties: false;
};
export declare const ASK_TOOLS: Anthropic.Tool[];
/** Sites the web search may read: league, reference, and hockey news only. */
export declare const SEARCH_DOMAINS: string[];
/** Server-side web search: ~$0.01 a search plus the result tokens, so one per question. */
export declare const WEB_SEARCH_TOOL: {
    readonly type: "web_search_20250305";
    readonly name: "web_search";
    readonly max_uses: 1;
    readonly allowed_domains: string[];
};
export interface AskLlmInput {
    question: string;
    repliedTo?: string;
    today: string;
}
export declare function buildUserTurn(input: AskLlmInput): string;
export type ToolExecutor = (name: string, input: unknown) => Promise<string>;
/** The subset of the SDK client this module uses (lets tests pass a mock). */
export interface MessagesClient {
    messages: {
        create(body: Anthropic.MessageCreateParamsNonStreaming, options?: {
            signal?: AbortSignal;
            timeout?: number;
        }): Promise<Anthropic.Message>;
    };
}
export interface Usage {
    inputTokens: number;
    outputTokens: number;
    webSearches: number;
}
export type LlmErrorReason = 'timeout' | 'rate_limited' | 'auth' | 'overloaded' | 'api' | 'max_tokens' | 'bad_output' | 'unknown';
export type LlmOutcome = ({
    kind: 'answer';
    answer: string;
} & Usage) | ({
    kind: 'off_topic';
} & Usage) | ({
    kind: 'refusal';
} & Usage) | ({
    kind: 'error';
    reason: LlmErrorReason;
    error?: unknown;
} & Usage);
/** Parse the final JSON answer. Null if it isn't the expected shape. */
export declare function parseFinalAnswer(text: string): {
    on_topic: boolean;
    answer: string;
} | null;
/** Strip anything that could ping or impersonate a mention, tidy whitespace, cap length. */
export declare function sanitizeAnswer(answer: string): string;
export declare function classifyError(error: unknown): LlmErrorReason;
export interface RunAskLlmOptions {
    client: MessagesClient;
    input: AskLlmInput;
    executeTool: ToolExecutor;
    knowledge?: string;
    nicknames?: readonly Nickname[];
    commandRef?: string;
    webSearch?: boolean;
    timeoutMs?: number;
    maxCalls?: number;
}
/**
 * Manual tool loop (not the beta tool runner) so the call cap, the last-call tool_choice
 * "none", the overall deadline and the client mock in tests are all explicit.
 */
export declare function runAskLlm(opts: RunAskLlmOptions): Promise<LlmOutcome>;
//# sourceMappingURL=llm.d.ts.map