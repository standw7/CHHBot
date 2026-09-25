"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.standingsForSeason = standingsForSeason;
/**
 * The NHL keeps serving last season's final standings until the new season's
 * first games are played (i.e. all of preseason). Returns the standings only if
 * they belong to `season` (e.g. 20262027), otherwise null so callers omit records.
 */
function standingsForSeason(response, season) {
    const standings = response?.standings;
    if (!standings?.length || standings[0].seasonId !== season)
        return null;
    return standings;
}
//# sourceMappingURL=standings.js.map