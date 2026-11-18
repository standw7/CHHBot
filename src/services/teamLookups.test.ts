import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EmbedBuilder } from 'discord.js';
import { buildStandingsEmbed, embedToText, findLastCompletedGame, findNextGame, pickSearchResult, seasonLabel } from './teamLookups.js';
import type { ScheduleGame, TeamStanding } from '../nhl/types.js';

const game = (id: number, start: string, state: string) =>
  ({ id, startTimeUTC: start, gameState: state, homeTeam: { abbrev: 'UTA' }, awayTeam: { abbrev: 'COL' } }) as ScheduleGame;

describe('schedule helpers', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const games = [
    game(1, '2026-11-10T02:00:00Z', 'OFF'),
    game(2, '2026-11-15T02:00:00Z', 'FINAL'),
    game(3, '2026-11-17T02:00:00Z', 'LIVE'),
    game(4, '2026-11-19T02:00:00Z', 'FUT'),
    game(5, '2026-11-21T02:00:00Z', 'FUT'),
  ];
  test('findNextGame skips past and live games', () => assert.equal(findNextGame(games, now)?.id, 4));
  test('findLastCompletedGame picks the latest finished game', () => assert.equal(findLastCompletedGame(games, now)?.id, 2));
  test('none', () => {
    assert.equal(findNextGame([], now), undefined);
    assert.equal(findLastCompletedGame([game(9, '2026-12-01T00:00:00Z', 'FUT')], now), undefined);
  });
});

describe('seasonLabel', () => {
  test('formats NHL season ids', () => {
    assert.equal(seasonLabel(20262027), '2026-27 Season');
    assert.equal(seasonLabel(undefined), 'Season');
  });
});

describe('buildStandingsEmbed', () => {
  const t = (abbrev: string, div: string, conf: string, points: number) =>
    ({ teamAbbrev: { default: abbrev }, divisionName: div, conferenceName: conf, gamesPlayed: 10, wins: 5, losses: 4, otLosses: 1, points, streakCode: 'W', streakCount: 1 }) as TeamStanding;
  const table = [t('UTA', 'Central', 'Western', 20), t('COL', 'Central', 'Western', 22), t('VGK', 'Pacific', 'Western', 18), t('BOS', 'Atlantic', 'Eastern', 25)];
  test('defaults to our conference and bolds us', () => {
    const e = buildStandingsEmbed(table, 'UTA');
    assert.equal(e.data.title, 'Western Conference Playoff Picture');
    assert.match(e.data.description ?? '', /\*\*UTA\*\*/);
  });
  test('league view', () => {
    assert.equal(buildStandingsEmbed(table, 'UTA', 'league').data.title, 'NHL Standings (Top 16)');
  });
});

describe('embedToText', () => {
  test('flattens and strips markdown and custom emoji', () => {
    const e = new EmbedBuilder().setTitle('<:UTA:123> UTA @ COL').setDescription('**bold**').addFields({ name: 'Goals', value: '`3`' }).setFooter({ text: 'f' });
    assert.equal(embedToText(e, 'pre'), 'pre\nUTA UTA @ COL\nbold\nGoals: 3\nf');
  });
});

describe('pickSearchResult', () => {
  const r = (name: string, active: boolean) => ({ name, active, playerId: name }) as unknown as import('../nhl/types.js').PlayerSearchResult;
  test('exact name match ignoring apostrophes and case, active first', () => {
    const results = [r("Shane O'Brien", false), r("Liam O'Brien", false), r("Liam O'Brien", true)];
    const hit = pickSearchResult("liam obrien", results);
    assert.equal(hit?.name, "Liam O'Brien");
    assert.equal(hit?.active, true);
  });
  test('no exact match → undefined (caller falls back to a last-name search)', () => {
    assert.equal(pickSearchResult("Liam O'Brien", [r('Liam Ohgren', true)]), undefined);
  });
});
