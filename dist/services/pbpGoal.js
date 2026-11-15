"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.goalFromPlay = goalFromPlay;
exports.goalsSoFarFromPlays = goalsSoFarFromPlays;
// The landing endpoint (names, assists, replay links) often lags the play-by-play by
// a minute or more, so a goal card posted on the spoiler delay can find its goal
// missing there. The play-by-play already has everything the card needs: the goal's
// player IDs and running totals, and rosterSpots with the name of everyone dressed
// (call-ups included). These build a landing-shaped goal from it.
function findSpot(spots, playerId) {
    return playerId === undefined ? undefined : spots.find(s => s.playerId === playerId);
}
function assistFrom(spots, playerId, total) {
    const spot = findSpot(spots, playerId);
    if (!spot)
        return undefined;
    return {
        playerId: spot.playerId,
        firstName: spot.firstName,
        lastName: spot.lastName,
        name: { default: `${spot.firstName.default[0]}. ${spot.lastName.default}` },
        assistsToDate: total ?? 0,
        sweaterNumber: spot.sweaterNumber,
    };
}
/** A landing-shaped goal built from a play-by-play goal play, or undefined if the scorer isn't in rosterSpots. */
function goalFromPlay(play, pbp) {
    const d = play.details;
    const spots = pbp.rosterSpots ?? [];
    const scorer = findSpot(spots, d?.scoringPlayerId);
    if (!d || !scorer)
        return undefined;
    const assists = [
        assistFrom(spots, d.assist1PlayerId, d.assist1PlayerTotal),
        assistFrom(spots, d.assist2PlayerId, d.assist2PlayerTotal),
    ].filter((a) => a !== undefined);
    const isHome = d.eventOwnerTeamId === pbp.homeTeam.id;
    return {
        situationCode: play.situationCode,
        eventId: play.eventId,
        strength: 'ev', // only used when situationCode is missing
        playerId: scorer.playerId,
        firstName: scorer.firstName,
        lastName: scorer.lastName,
        name: { default: `${scorer.firstName.default[0]}. ${scorer.lastName.default}` },
        teamAbbrev: { default: isHome ? pbp.homeTeam.abbrev : pbp.awayTeam.abbrev },
        headshot: scorer.headshot,
        goalsToDate: d.scoringPlayerTotal ?? 0,
        awayScore: d.awayScore ?? 0,
        homeScore: d.homeScore ?? 0,
        timeInPeriod: play.timeInPeriod,
        shotType: d.shotType,
        assists,
        highlightClipSharingUrl: d.highlightClipSharingUrl,
        isHome,
        sweaterNumber: scorer.sweaterNumber,
        periodType: play.periodDescriptor?.periodType,
    };
}
/**
 * All goals in the game up to and including `eventId`, in order, from the play-by-play,
 * preferring the landing version of each goal when it has one. Undefined if the goal
 * itself can't be built.
 */
function goalsSoFarFromPlays(pbp, eventId, landingGoals) {
    const goalPlays = pbp.plays.filter(p => p.typeDescKey === 'goal');
    const idx = goalPlays.findIndex(p => p.eventId === eventId);
    if (idx === -1)
        return undefined;
    const result = [];
    for (const play of goalPlays.slice(0, idx + 1)) {
        const fromLanding = landingGoals.find(g => g.eventId === play.eventId);
        const goal = fromLanding ?? goalFromPlay(play, pbp);
        if (goal)
            result.push(goal);
    }
    return result[result.length - 1]?.eventId === eventId ? result : undefined;
}
//# sourceMappingURL=pbpGoal.js.map