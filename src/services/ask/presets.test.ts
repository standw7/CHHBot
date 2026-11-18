import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFLECTIONS, STARTER_PRESETS, CAPPED_GUILD_REPLIES, CAPPED_USER_REPLIES, ERROR_REPLIES, EMPTY_PING_REPLIES,
  fillTemplate, groupPresets, matchPreset, parseAddPreset, pickRandom, starterPresetRows,
} from './presets.js';
import { normalizeText, stripVocative, truncate } from './text.js';

const groups = groupPresets(starterPresetRows().map((r, i) => ({ id: i + 1, trigger: r.trigger, response: r.response, exact_only: r.exactOnly })));
const match = (msg: string) => matchPreset(normalizeText(msg), groups)?.trigger ?? null;

describe('normalizeText', () => {
  test('lowercases, strips punctuation, mentions, emoji, accents and apostrophes', () => {
    assert.equal(normalizeText("<@123456789012345678> What's   the NEXT game?!"), 'whats the next game');
    assert.equal(normalizeText('<:UTA:1234> go <@&99> mammoth @everyone'), 'go mammoth');
    assert.equal(normalizeText('Schmaltz, Guenther & Kerfoot'), 'schmaltz guenther kerfoot');
    assert.equal(normalizeText('André Tourigny'), 'andre tourigny');
    assert.equal(normalizeText('   '), '');
  });

  test('stripVocative drops a leading/trailing "tusky" only when something else remains', () => {
    assert.equal(stripVocative('thanks tusky'), 'thanks');
    assert.equal(stripVocative('tusky who are you'), 'who are you');
    assert.equal(stripVocative('tusky'), 'tusky');
  });

  test('truncate cuts on a word boundary with an ellipsis', () => {
    assert.equal(truncate('short', 10), 'short');
    const t = truncate('one two three four five six seven', 20);
    assert.ok(t.length <= 20 && t.endsWith('…'), t);
  });
});

describe('matchPreset', () => {
  test('exact-only short words do not fire inside other words or sentences', () => {
    assert.equal(match('hi'), 'hi');
    assert.equal(match('Hi Tusky!'), 'hi');
    assert.equal(match('this is it'), null);
    assert.equal(match('hi when is the next game'), null);
  });

  test('clean hits fire, long questions that merely contain the trigger do not', () => {
    assert.equal(match('thanks'), 'thanks');
    assert.equal(match('thanks so much tusky'), 'thanks');
    assert.equal(match('Thank you!'), 'thank you');
    assert.equal(match('thanks, but when does the power play unit change'), null);
    assert.equal(match('are we making the playoffs this year'), 'are we making the playoffs');
    assert.equal(match('who is the best player in the whole nhl right now'), null);
  });

  test('prefers the longest matching trigger', () => {
    assert.equal(match('where can I listen to Clean Hits?'), 'where can i listen to clean hits');
    assert.equal(match('who hosts clean hits'), 'who hosts clean hits');
    assert.equal(match('clean hits'), 'clean hits');
    assert.equal(match("what's clean hits"), 'whats clean hits');
  });

  test('assorted starter triggers', () => {
    assert.equal(match('good bot'), 'good bot');
    assert.equal(match('TUSKS UP'), 'tusks up');
    assert.equal(match('the refs'), 'the refs');
    assert.equal(match('what can you do?'), 'what can you do');
    assert.equal(match('ping'), 'ping');
    assert.equal(match('who is tusky'), 'who is tusky');
    assert.equal(match('tusky'), 'tusky');
    assert.equal(match('when is the next game'), null);
  });
});

describe('starter set and canned lines', () => {
  test('has ~25-30 triggers groups with several responses for most', () => {
    assert.ok(STARTER_PRESETS.length >= 25 && STARTER_PRESETS.length <= 32, String(STARTER_PRESETS.length));
    for (const p of STARTER_PRESETS) {
      assert.ok(p.responses.length >= 1);
      for (const t of p.triggers) assert.equal(t, normalizeText(t), `trigger "${t}" must be pre-normalized`);
      for (const e of p.exactOnly ?? []) assert.ok(p.triggers.includes(e), `exactOnly "${e}" not in triggers`);
    }
  });

  test('dry voice: no exclamation marks, no unknown placeholders, no mentions', () => {
    const all = [
      ...STARTER_PRESETS.flatMap(p => p.responses), ...DEFLECTIONS, ...CAPPED_USER_REPLIES,
      ...CAPPED_GUILD_REPLIES, ...ERROR_REPLIES, ...EMPTY_PING_REPLIES,
    ];
    for (const line of all) {
      assert.ok(!line.replace(/`[^`]*`/g, '').includes('!'), `exclamation in: ${line}`);
      for (const [, name] of line.matchAll(/\{(\w+)\}/g)) assert.ok(['youtube', 'substack', 'crew_role'].includes(name), name);
      assert.ok(!/<@|@everyone|@here/.test(line), line);
      assert.ok(line.length <= 600, line);
    }
  });

  test('deflection list is non-empty and pickRandom stays in range', () => {
    assert.ok(DEFLECTIONS.length >= 5);
    assert.equal(pickRandom(DEFLECTIONS, () => 0), DEFLECTIONS[0]);
    assert.equal(pickRandom(DEFLECTIONS, () => 0.9999999), DEFLECTIONS[DEFLECTIONS.length - 1]);
    assert.equal(pickRandom(DEFLECTIONS, () => 1), DEFLECTIONS[DEFLECTIONS.length - 1]);
  });

  test('groupPresets groups multiple responses under one trigger', () => {
    const g = groupPresets([
      { id: 1, trigger: 'ping', response: 'Pong.', exact_only: 1 },
      { id: 2, trigger: 'ping', response: 'Pong. Still here.', exact_only: 1 },
      { id: 3, trigger: 'go mammoth', response: 'Tusks up.', exact_only: 0 },
    ]);
    assert.equal(g.length, 2);
    assert.equal(g.find(x => x.trigger === 'ping')?.responses.length, 2);
  });
});

describe('fillTemplate', () => {
  test('fills known placeholders and leaves others alone', () => {
    assert.equal(fillTemplate('{crew_role} at {youtube} {nope}', { crew_role: '<@&1>', youtube: 'Y' }), '<@&1> at Y {nope}');
  });
});

describe('parseAddPreset', () => {
  test('parses trigger => response', () => {
    assert.deepEqual(parseAddPreset('Who is the GOAT? => Depends on the decade.'), {
      ok: true, trigger: 'who is the goat', response: 'Depends on the decade.', exactOnly: false,
    });
  });
  test('exact: prefix and auto-exact for short single words', () => {
    assert.equal((parseAddPreset('exact: good game => GG.') as { exactOnly: boolean }).exactOnly, true);
    assert.equal((parseAddPreset('gg => Good game.') as { exactOnly: boolean }).exactOnly, true);
    assert.equal((parseAddPreset('hello there => Hi.') as { exactOnly: boolean }).exactOnly, false);
  });
  test('rejects malformed input', () => {
    assert.equal(parseAddPreset('no arrow here').ok, false);
    assert.equal(parseAddPreset('?? => hi').ok, false);
    assert.equal(parseAddPreset('trigger =>   ').ok, false);
  });
  test('response keeps its formatting', () => {
    const r = parseAddPreset('links => YouTube: {youtube}\nSubstack: {substack}');
    assert.ok(r.ok && r.response === 'YouTube: {youtube}\nSubstack: {substack}');
  });
});

describe('Tusky is a woolly mammoth', () => {
  test('no "walrus" anywhere in starter presets, deflections or canned replies', () => {
    const all = [
      ...STARTER_PRESETS.flatMap(p => [...p.triggers, ...p.responses]),
      ...DEFLECTIONS, ...EMPTY_PING_REPLIES, ...CAPPED_USER_REPLIES, ...CAPPED_GUILD_REPLIES, ...ERROR_REPLIES,
    ];
    for (const line of all) assert.doesNotMatch(line, /walrus/i, line);
    assert.ok(all.includes('Fair. I am a woolly mammoth with a Wi-Fi connection.'));
    assert.ok(all.includes('I am a bot. A mammoth-shaped one.'));
    assert.ok(DEFLECTIONS.includes('I\'m a hockey mammoth. Ask me about hockey.'));
  });
});
