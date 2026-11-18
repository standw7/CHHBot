import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNicknameList, formatNicknamed, nicknameUsedFor, parseAddNickname, resolveNameQuery, resolveNicknames,
  starterNicknameRows, STARTER_NICKNAMES,
} from './nicknames.js';
import { formatStatAnswer, parseIntent } from './intents.js';
import { groupPresets, matchPreset, starterPresetRows } from './presets.js';
import { normalizeText } from './text.js';
import type { PlayerSeasonStats } from '../../nhl/types.js';

const NICKS = starterNicknameRows();
const resolve = (q: string) => resolveNicknames(normalizeText(q), NICKS);

describe('starter nicknames', () => {
  test('seed list: current roster nicknames, normalized keys, unique', () => {
    const map = Object.fromEntries(NICKS.map(n => [n.key, n.player]));
    assert.equal(map['cools'], 'Logan Cooley');
    assert.equal(map['gunner'], 'Dylan Guenther');
    assert.equal(map['spicy tuna'], 'Liam O\'Brien');
    assert.equal(map['tuna'], 'Liam O\'Brien');
    assert.equal(map['cheeks'], 'Daniil But');
    assert.equal(map['kells'], 'Clayton Keller');
    assert.equal(map['kellsy'], 'Clayton Keller');
    assert.equal(map['the sheriff'], 'Lawson Crouse');
    assert.equal(map['sheriff'], 'Lawson Crouse');
    assert.equal(map['kfc'], 'Nick Schmaltz');
    assert.equal(map['biggy schmaltz'], 'Nick Schmaltz');
    assert.equal(map['veggie'], 'Karel Vejmelka');
    assert.equal(map['carcs'], 'Michael Carcone');
    assert.equal(map['stenny'], 'Kevin Stenlund');
    assert.equal(map['yams'], 'Kailer Yamamoto');
    assert.equal(map['bainer'], 'Jack McBain');
    assert.equal(map['tro'], 'Vincent Trocheck');
    assert.equal(map['mavlam'], 'Maveric Lamoureux');
    assert.equal(map['schmitty'], 'Nate Schmidt');
    assert.equal(map['sergy'], 'Mikhail Sergachev');
    assert.equal(map['sima'], 'Dmitri Simashev');
    assert.equal(map['weegs'], 'MacKenzie Weegar');
    assert.equal(new Set(NICKS.map(n => n.key)).size, NICKS.length);
    assert.equal(NICKS.length, STARTER_NICKNAMES.flatMap(p => p.nicknames).length);
  });
});

describe('resolveNicknames', () => {
  test('replaces a nickname with the player name and reports the hit', () => {
    const r = resolve('How many goals does Gunner have?');
    assert.equal(r.text, 'how many goals does dylan guenther have');
    assert.deepEqual(r.hits, [{ nickname: 'Gunner', player: 'Dylan Guenther' }]);
  });

  test('case-insensitive', () => {
    assert.equal(resolve('COOLS stats').text, 'logan cooley stats');
    assert.equal(resolve('kFc stats').text, 'nick schmaltz stats');
  });

  test('longest first: "spicy tuna" beats "tuna", "the sheriff" beats "sheriff", "kellsy" is not "kells"', () => {
    const r = resolve('how is spicy tuna doing');
    assert.equal(r.text, 'how is liam obrien doing');
    assert.deepEqual(r.hits, [{ nickname: 'Spicy Tuna', player: 'Liam O\'Brien' }]);
    assert.equal(resolve('how is the sheriff doing').text, 'how is lawson crouse doing');
    assert.equal(resolve('sheriff stats').text, 'lawson crouse stats');
    assert.deepEqual(resolve('kellsy stats').hits, [{ nickname: 'Kellsy', player: 'Clayton Keller' }]);
    assert.equal(resolve('tuna stats').text, 'liam obrien stats');
  });

  test('possessives: "cools\'s", "cools\'", "gunner\'s" (curly apostrophes too)', () => {
    assert.equal(resolve('cools\'s stats').text, 'logan cooley stats');
    assert.equal(resolve('cools\' stats').text, 'logan cooley stats');
    assert.equal(resolve('gunner\'s goals').text, 'dylan guenther goals');
    assert.equal(resolve('what are gunner’s stats').text, 'what are dylan guenther stats');
    assert.equal(resolve('veggies numbers').text, 'karel vejmelka numbers');
  });

  test('whole words only', () => {
    for (const q of ['that was fortunate', 'tunafish sandwich', 'the sheriffs office', 'schmaltzy music', 'gunnery sergeant', 'coolsville']) {
      const r = resolve(q);
      if (q === 'the sheriffs office') {
        // "sheriffs" is a possessive of a real nickname; that one is intended to resolve
        assert.equal(r.text, 'lawson crouse office');
        continue;
      }
      assert.equal(r.text, normalizeText(q), q);
      assert.deepEqual(r.hits, [], q);
    }
  });

  test('short nicknames (Tro, Sima, Yams) only match as whole words, any case', () => {
    for (const q of ['who won the trophy', 'trocheck stats', 'is simashev playing', 'sweet yamamoto goal', 'astro turf', 'yam fries', 'simba']) {
      const r = resolve(q);
      assert.deepEqual(r.hits, [], q);
      assert.equal(r.text, normalizeText(q), q);
    }
    assert.equal(resolve('TRO stats').text, 'vincent trocheck stats');
    assert.equal(resolve('how is Sima doing').text, 'how is dmitri simashev doing');
    assert.equal(resolve('how many goals does yams have').text, 'how many goals does kailer yamamoto have');
    assert.equal(resolve('MavLam\'s stats').text, 'maveric lamoureux stats');
    assert.equal(resolve('Vincent Tro Trocheck').text, 'vincent trocheck');
  });

  test('several nicknames, each reported once', () => {
    const r = resolve('cools or gunner, who has more goals? gunner probably');
    assert.equal(r.text, 'logan cooley or dylan guenther who has more goals dylan guenther probably');
    assert.deepEqual(r.hits.map(h => h.nickname), ['Cools', 'Gunner']);
  });

  test('nickname next to the real name is dropped, not doubled', () => {
    assert.equal(resolve('Logan "Cools" Cooley stats').text, 'logan cooley stats');
    assert.equal(resolve('Liam spicy tuna obrien').text, 'liam obrien');
  });

  test('no nicknames or empty input leaves text unchanged', () => {
    assert.deepEqual(resolveNicknames('when is the next game', []), { text: 'when is the next game', hits: [] });
    assert.deepEqual(resolveNicknames('', NICKS), { text: '', hits: [] });
  });
});

describe('nicknames in tier 1 and tier 2', () => {
  test('player-stat intents resolve to the real name', () => {
    const intent = (q: string) => parseIntent(resolve(q).text);
    assert.deepEqual(intent('how many goals does gunner have'), { kind: 'player_stats', player: 'dylan guenther', stat: 'goals' });
    assert.deepEqual(intent('cheeks stats'), { kind: 'player_stats', player: 'daniil but' });
    assert.deepEqual(intent('cools\'s stats'), { kind: 'player_stats', player: 'logan cooley' });
    assert.deepEqual(intent('how many wins does veggie have'), { kind: 'player_stats', player: 'karel vejmelka', stat: 'wins' });
    assert.deepEqual(intent('how is spicy tuna doing'), { kind: 'player_stats', player: 'liam obrien' });
    assert.deepEqual(intent('how is the sheriff playing'), { kind: 'player_stats', player: 'lawson crouse' });
  });

  test('presets still match normally (the router tries the typed question first)', () => {
    const groups = groupPresets(starterPresetRows().map((r, i) => ({ id: i + 1, trigger: r.trigger, response: r.response, exact_only: r.exactOnly })));
    for (const q of ['thanks', 'good bot', 'who are you', 'when is the next game']) {
      const n = normalizeText(q);
      assert.equal(resolveNicknames(n, NICKS).text, n, q);
    }
    assert.ok(matchPreset(normalizeText('thanks tusky'), groups));
    // A bare nickname resolves to a name, which no starter preset claims
    assert.equal(resolve('kfc').text, 'nick schmaltz');
    assert.equal(matchPreset('nick schmaltz', groups), null);
  });

  test('nicknameUsedFor finds the nickname for the resolved player only', () => {
    const r = resolve('how many goals does cools have');
    assert.equal(nicknameUsedFor('logan cooley', r.hits), 'Cools');
    assert.equal(nicknameUsedFor('dylan guenther', r.hits), undefined);
    assert.equal(nicknameUsedFor('liam obrien', resolve('tuna stats').hits), 'Tuna');
  });
});

describe('formatting', () => {
  test('formatNicknamed puts the nickname between first and last name', () => {
    assert.equal(formatNicknamed('Logan Cooley', 'Cools'), 'Logan "Cools" Cooley');
    assert.equal(formatNicknamed('Liam O\'Brien', 'Spicy Tuna'), 'Liam "Spicy Tuna" O\'Brien');
    assert.equal(formatNicknamed('Lawson Crouse', 'The Sheriff'), 'Lawson "The Sheriff" Crouse');
    assert.equal(formatNicknamed('Pelé', 'King'), '"King" Pelé');
    assert.equal(formatNicknamed('Logan Cooley', ''), 'Logan Cooley');
  });

  test('tier-2 stat line with the nickname the user asked by', () => {
    const season = { gamesPlayed: 19, goals: 11 } as unknown as PlayerSeasonStats;
    assert.equal(
      formatStatAnswer(formatNicknamed('Logan Cooley', 'Cools'), 'C', season, 'goals', '2026-27 Season'),
      'Logan "Cools" Cooley has 11 goals in 19 games (2026-27).',
    );
  });

  test('formatNicknameList groups by player in a stable sorted order', () => {
    const list = formatNicknameList(NICKS);
    assert.equal(list, formatNicknameList([...NICKS].reverse()));
    assert.match(list, /^- Clayton Keller: Kells, Kellsy$/m);
    assert.match(list, /^- Liam O'Brien: Spicy Tuna, Tuna$/m);
    assert.match(list, /^- Nick Schmaltz: Biggy Schmaltz, KFC$/m);
    assert.equal(list.split('\n').length, STARTER_NICKNAMES.length);
    assert.equal(formatNicknameList([]), '');
  });

  test('resolveNameQuery maps a nickname tool input to the real name', () => {
    assert.equal(resolveNameQuery('Spicy Tuna', NICKS), 'Liam O\'Brien');
    assert.equal(resolveNameQuery('cheeks', NICKS), 'Daniil But');
    assert.equal(resolveNameQuery('Logan Cooley', NICKS), 'Logan Cooley');
    assert.equal(resolveNameQuery('Connor McDavid', NICKS), 'Connor McDavid');
  });
});

describe('parseAddNickname', () => {
  test('parses nickname => player', () => {
    assert.deepEqual(parseAddNickname('Spicy Tuna => Liam O\'Brien'), { ok: true, nickname: 'Spicy Tuna', key: 'spicy tuna', player: 'Liam O\'Brien' });
    assert.deepEqual(parseAddNickname('"Cools"  =>  Logan   Cooley'), { ok: true, nickname: 'Cools', key: 'cools', player: 'Logan Cooley' });
  });

  test('rejects malformed or too-common nicknames', () => {
    for (const raw of ['Cools Logan Cooley', ' => Logan Cooley', 'Cools => ', 'x => Someone', 'tusky => Someone', 'the team => Someone', 'one two three four five => Someone']) {
      assert.equal(parseAddNickname(raw).ok, false, raw);
    }
  });
});
