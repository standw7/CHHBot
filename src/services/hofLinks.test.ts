import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPostLinks, rewriteSocialLink, summarizeMessage, buildFollowupContent,
  sumTomatoCount, tomatoHeader, parseTomatoHeader, NO_TEXT_FALLBACK,
} from './hofLinks.js';

describe('rewriteSocialLink', () => {
  test('twitter/x → fxtwitter', () => {
    assert.equal(rewriteSocialLink('https://x.com/user/status/123?s=20'), 'https://fxtwitter.com/user/status/123?s=20');
    assert.equal(rewriteSocialLink('https://vxtwitter.com/user/status/9'), 'https://fxtwitter.com/user/status/9');
  });
  test('instagram → vxinstagram (drops query/trailing path)', () => {
    assert.equal(rewriteSocialLink('https://www.instagram.com/reel/AbC-1/?igsh=xyz'), 'https://vxinstagram.com/reel/AbC-1/?igsh=xyz');
  });
  test('tiktok → tnktok, keeping vm.', () => {
    assert.equal(rewriteSocialLink('https://vm.tiktok.com/ZMabc/'), 'https://vm.tnktok.com/ZMabc/');
    assert.equal(rewriteSocialLink('https://www.tiktok.com/@u/video/1'), 'https://tnktok.com/@u/video/1');
  });
  test('other links unchanged', () => {
    assert.equal(rewriteSocialLink('https://imgur.com/a/xyz'), 'https://imgur.com/a/xyz');
  });
});

describe('extractPostLinks', () => {
  test('all links, social rewritten, in order', () => {
    const links = extractPostLinks(['lol https://imgur.com/a/xyz and https://x.com/u/status/1 ok']);
    assert.deepEqual(links, ['https://imgur.com/a/xyz', 'https://fxtwitter.com/u/status/1']);
  });
  test('dedupes across variants and texts', () => {
    const links = extractPostLinks(['https://x.com/u/status/1', 'https://twitter.com/u/status/1 https://fxtwitter.com/u/status/1']);
    assert.deepEqual(links, ['https://fxtwitter.com/u/status/1']);
  });
  test('skips discord message links and <suppressed> links', () => {
    const links = extractPostLinks(['see https://discord.com/channels/1/2/3 and <https://example.com/x> and https://example.com/y']);
    assert.deepEqual(links, ['https://example.com/y']);
  });
  test('trims trailing punctuation and markdown, keeps balanced parens', () => {
    const links = extractPostLinks(['(https://a.com/x). ||https://b.com/y|| [t](https://c.com/z) https://en.wikipedia.org/wiki/Foo_(bar),']);
    assert.deepEqual(links, ['https://a.com/x', 'https://b.com/y', 'https://c.com/z', 'https://en.wikipedia.org/wiki/Foo_(bar)']);
  });
  test('caps at max', () => {
    const text = Array.from({ length: 8 }, (_, i) => `https://e${i}.com/`).join(' ');
    assert.equal(extractPostLinks([text]).length, 5);
    assert.equal(extractPostLinks([text], 2).length, 2);
  });
  test('handles null/empty', () => {
    assert.deepEqual(extractPostLinks([null, undefined, '']), []);
  });
});

describe('summarizeMessage', () => {
  test('content first', () => {
    assert.equal(summarizeMessage({ content: 'hi', embeds: [{ description: 'x' }] }, 300), 'hi');
  });
  test('forwarded snapshot content', () => {
    assert.equal(summarizeMessage({ content: '', snapshotContent: 'fwd' }, 300), 'fwd');
  });
  test('bot quote embed: description', () => {
    assert.equal(
      summarizeMessage({ content: '', embeds: [{ description: 'I\'d go for a walk if I could walk you…', authorName: 'Tusky' }] }, 300),
      'I\'d go for a walk if I could walk you…'
    );
  });
  test('embed title + description combined; title only; author only', () => {
    assert.equal(summarizeMessage({ embeds: [{ title: 'T', description: 'D' }] }, 300), '**T**\nD');
    assert.equal(summarizeMessage({ embeds: [{ title: 'T' }] }, 300), '**T**');
    assert.equal(summarizeMessage({ embeds: [{ authorName: 'A' }] }, 300), 'A');
  });
  test('skips empty embeds (e.g. image-only) and falls to attachments', () => {
    assert.equal(summarizeMessage({ embeds: [{}], attachments: [{ contentType: 'image/png' }] }, 300), '🖼 Image attached');
    assert.equal(summarizeMessage({ attachments: [{ contentType: 'video/mp4' }, { contentType: 'image/png' }] }, 300), '📎 Media attached');
    assert.equal(summarizeMessage({ attachments: [{ contentType: 'video/mp4' }] }, 300), '🎬 Video attached');
    assert.equal(summarizeMessage({ attachments: [{ contentType: null }] }, 300), '📎 Attachment');
  });
  test('sticker, then fallback', () => {
    assert.equal(summarizeMessage({ stickerNames: ['Wave'] }, 300), '🏷 Sticker: Wave');
    assert.equal(summarizeMessage({}, 300), NO_TEXT_FALLBACK);
  });
  test('truncates', () => {
    assert.equal(summarizeMessage({ content: 'x'.repeat(400) }, 300), 'x'.repeat(300) + '... (truncated)');
  });
});

describe('buildFollowupContent', () => {
  test('links with captions, no label', () => {
    assert.equal(
      buildFollowupContent(null, [{ url: 'https://vxinstagram.com/p/a', caption: '-# A (@a)\n> hi' }, { url: 'https://imgur.com/x' }]),
      'https://vxinstagram.com/p/a\n-# A (@a)\n> hi\nhttps://imgur.com/x'
    );
  });
  test('label first', () => {
    assert.equal(buildFollowupContent('-# ↩ Replying to Bob', [{ url: 'https://a.com' }]), '-# ↩ Replying to Bob\nhttps://a.com');
  });
  test('drops captions to fit 2000 chars, keeping links', () => {
    const cap = '> ' + 'x'.repeat(900);
    const out = buildFollowupContent(null, [1, 2, 3].map(i => ({ url: `https://vxinstagram.com/p/${i}`, caption: cap })));
    assert.ok(out.length <= 2000);
    for (const i of [1, 2, 3]) assert.ok(out.includes(`https://vxinstagram.com/p/${i}`));
  });
});

describe('tomato counts', () => {
  test('sums all tomato emojis only', () => {
    assert.equal(sumTomatoCount([
      { emojiName: '🍅', count: 6 }, { emojiName: 'tomato_angry', count: 2 }, { emojiName: '🔥', count: 9 }, { emojiName: null, count: 1 },
    ]), 8);
  });
  test('header round-trip', () => {
    assert.equal(tomatoHeader(12), '🍅 **12**');
    assert.equal(parseTomatoHeader('🍅 **12**'), 12);
    assert.equal(parseTomatoHeader('nope'), null);
  });
});
