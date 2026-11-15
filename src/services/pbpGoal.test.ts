import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { goalFromPlay, goalsSoFarFromPlays } from './pbpGoal.js';
import { buildGoalCard } from './goalCard.js';
import type { PlayByPlayResponse } from '../nhl/types.js';

// SJS @ UTA, 2026-11-14: Zac Jones' 2nd goal (event 335) wasn't in landing yet when its card posted
const pbp = JSON.parse(readFileSync(new URL('./fixtures/goals-2026020323.json', import.meta.url), 'utf8')) as PlayByPlayResponse;
const jonesSecond = pbp.plays.find(p => p.eventId === 335)!;

describe('goalFromPlay', () => {
  test('builds scorer, totals, and assists from rosterSpots', () => {
    const goal = goalFromPlay(jonesSecond, pbp)!;
    assert.equal(`${goal.firstName.default} ${goal.lastName.default}`, 'Zac Jones');
    assert.equal(goal.sweaterNumber, 15);
    assert.equal(goal.goalsToDate, 2);
    assert.equal(goal.shotType, 'slap');
    assert.deepEqual(goal.assists.map(a => [a.lastName.default, a.assistsToDate]), [['Lee', 6]]);
    assert.equal(goal.teamAbbrev.default, 'UTA');
  });

  test('scorer not in rosterSpots → undefined', () => {
    assert.equal(goalFromPlay(jonesSecond, { ...pbp, rosterSpots: [] }), undefined);
  });

  test('goal card names the scorer instead of "Unknown"', () => {
    const goal = goalFromPlay(jonesSecond, pbp)!;
    const { embed } = buildGoalCard({
      landingGoal: goal, play: jonesSecond, homeTeam: pbp.homeTeam, awayTeam: pbp.awayTeam,
      scoringTeamAbbrev: 'UTA', scoringTeamLogo: pbp.homeTeam.logo,
    }, 'off');
    assert.match(embed.toJSON().description!, /^#15 Zac Jones \(2\) slap assists: #72 Anders Lee \(6\)/);
  });
});

describe('goalsSoFarFromPlays', () => {
  test('uses landing goals where present and fills the rest from play-by-play', () => {
    const fromLanding = goalFromPlay(pbp.plays[0], pbp)!;
    const tagged = { ...fromLanding, highlightClipSharingUrl: 'from-landing' };
    const goals = goalsSoFarFromPlays(pbp, 335, [tagged])!;
    assert.deepEqual(goals.map(g => g.eventId), [87, 186, 323, 335]);
    assert.equal(goals[0].highlightClipSharingUrl, 'from-landing');
    // Two Jones goals in the list, so milestone detection counts the second correctly
    assert.equal(goals.filter(g => g.playerId === 8481708).length, 2);
  });

  test('unknown event → undefined', () => {
    assert.equal(goalsSoFarFromPlays(pbp, 999, []), undefined);
  });
});
