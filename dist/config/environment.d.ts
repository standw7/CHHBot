export interface AppConfig {
    discordToken: string;
    discordClientId: string;
    discordGuildId: string | undefined;
    logLevel: string;
    databasePath: string | undefined;
    /** Ask Tusky's LLM fallback (Claude Haiku). Unset = presets and live data only. */
    anthropicApiKey: string | undefined;
    askUserDailyCap: number;
    askGuildDailyCap: number;
    askSearchDailyCap: number;
}
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=environment.d.ts.map