/** Current-roster nicknames with a public source (KSL Sports, The Hockey News, Deseret News) or from the server owner. */
export declare const STARTER_NICKNAMES: {
    player: string;
    nicknames: string[];
}[];
export interface Nickname {
    nickname: string;
    player: string;
    key?: string;
}
export declare function nicknameKey(nickname: string): string;
export declare function starterNicknameRows(): {
    nickname: string;
    key: string;
    player: string;
}[];
export interface ResolvedNicknames {
    /** The normalized question with each nickname replaced by the player's normalized name. */
    text: string;
    /** Nicknames found, in order of appearance, one per nickname. */
    hits: {
        nickname: string;
        player: string;
    }[];
}
/**
 * Replaces nicknames in a normalized question (see normalizeText) with the players' names.
 * Whole words only ("tuna" never matches inside "fortunate"), case-insensitive because the
 * input is normalized, longest nickname first, possessives dropped ("gunner's goals" →
 * "dylan guenther goals"). A nickname written next to the real name ("logan cools cooley")
 * is just removed so the name isn't doubled.
 */
export declare function resolveNicknames(normalized: string, nicknames: readonly Nickname[]): ResolvedNicknames;
/** `Logan "Cools" Cooley`; a one-word name gets the nickname in front. */
export declare function formatNicknamed(fullName: string, nickname: string): string;
/** The nickname the user used for `player` (a normalized name as it appears in the resolved text), if any. */
export declare function nicknameUsedFor(player: string, hits: ResolvedNicknames['hits']): string | undefined;
/**
 * Safety net for the LLM's get_player_stats input: a nickname becomes the real name
 * ("Spicy Tuna" → "Liam O'Brien"); anything else is passed through unchanged.
 */
export declare function resolveNameQuery(query: string, nicknames: readonly Nickname[]): string;
/**
 * "Player: Nick, Nick" lines for the LLM system prompt, sorted by player then nickname
 * (independent of DB order) so the cached prompt only changes when the list does.
 */
export declare function formatNicknameList(nicknames: readonly Nickname[]): string;
export type AddNicknameParse = {
    ok: true;
    nickname: string;
    key: string;
    player: string;
} | {
    ok: false;
    error: string;
};
/** Parses `<nickname> => <player name>` (the part after `!ask nick add`). */
export declare function parseAddNickname(raw: string): AddNicknameParse;
//# sourceMappingURL=nicknames.d.ts.map