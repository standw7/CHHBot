/** MoneyPuck names seasons by start year: 2026 = 2026-27. Before October, the season that just ended. */
export declare function currentSeasonStartYear(now?: Date): number;
export interface MoneyPuckSkater {
    playerId: string;
    name: string;
    team: string;
    position: string;
    gamesPlayed: number;
    icetime: number;
    hits: number;
    takeaways: number;
    giveaways: number;
    blockedShots: number;
    xGoals: number;
    goals: number;
}
export declare function getMoneyPuckSkaters(teamCode: string, seasonStartYear?: number): Promise<MoneyPuckSkater[] | null>;
export declare function clearMoneyPuckCache(): void;
//# sourceMappingURL=moneyPuck.d.ts.map