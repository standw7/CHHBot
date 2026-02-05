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
}
export declare function getMoneyPuckSkaters(teamCode: string): Promise<MoneyPuckSkater[] | null>;
export declare function clearMoneyPuckCache(): void;
//# sourceMappingURL=moneyPuck.d.ts.map