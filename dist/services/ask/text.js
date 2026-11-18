"use strict";
// Text normalization shared by preset matching and intent parsing (pure).
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILLER_WORDS = void 0;
exports.normalizeText = normalizeText;
exports.tokens = tokens;
exports.contentTokens = contentTokens;
exports.stripVocative = stripVocative;
exports.truncate = truncate;
/**
 * Lowercase, drop mentions/custom emoji/@everyone, strip accents and apostrophes
 * ("what's" → "whats"), turn other punctuation into spaces, collapse whitespace.
 */
function normalizeText(input) {
    return input
        .replace(/<a?:\w+:\d+>/g, ' ')
        .replace(/<(?:@[!&]?|#)\d+>/g, ' ')
        .replace(/@(?:everyone|here)\b/gi, ' ')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/['’‘`]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function tokens(normalized) {
    return normalized ? normalized.split(' ') : [];
}
/** Words that don't change what's being asked ("thanks so much tusky" ≈ "thanks"). */
exports.FILLER_WORDS = new Set([
    'tusky', 'hey', 'yo', 'please', 'pls', 'plz', 'lol', 'lmao', 'haha', 'so', 'much', 'very',
    'really', 'man', 'bro', 'dude', 'buddy', 'again', 'a', 'lot', 'just', 'ok', 'okay', 'oh',
    'um', 'uh', 'rn',
]);
function contentTokens(toks) {
    return toks.filter(t => !exports.FILLER_WORDS.has(t));
}
/** Drop a leading/trailing "tusky" when it's just the name being addressed ("thanks tusky" → "thanks"). */
function stripVocative(normalized) {
    const t = tokens(normalized);
    while (t.length > 1 && t[0] === 'tusky')
        t.shift();
    while (t.length > 1 && t[t.length - 1] === 'tusky')
        t.pop();
    return t.join(' ');
}
/** Cut to `max` chars on a word boundary, with an ellipsis when cut. */
function truncate(text, max) {
    if (text.length <= max)
        return text;
    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}
//# sourceMappingURL=text.js.map