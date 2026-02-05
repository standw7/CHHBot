export interface AppConfig {
    discordToken: string;
    discordClientId: string;
    discordGuildId: string | undefined;
    logLevel: string;
    databasePath: string | undefined;
}
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=environment.d.ts.map