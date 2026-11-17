import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decodeHtmlEntities, parseSocialCaption, formatSocialCaption, isInstagramLink } from './socialCaption.js';

const FIXTURE = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="twitter:card" content="player">
<meta property="og:title" content="Utah Mammoth (@utahmammoth)">
<meta content="Let&#x2019;s set a world record together ... We got this &#x1F64C;&#xA;&#xA;#LikeTheEgg" property="og:description">
<meta property="og:video" content="https://vxinstagram.com/v.mp4">
</head><body></body></html>`;

describe('decodeHtmlEntities', () => {
  test('hex, decimal, astral and named entities', () => {
    assert.equal(decodeHtmlEntities('Let&#x2019;s &#x1F64C; &#65; &amp; &quot;x&quot; &apos;y&apos; &lt;z&gt;'), 'Let’s 🙌 A & "x" \'y\' <z>');
  });
  test('leaves unknown entities alone', () => {
    assert.equal(decodeHtmlEntities('&bogus; &#xZZ;'), '&bogus; &#xZZ;');
  });
});

describe('parseSocialCaption', () => {
  test('reads og:title and og:description regardless of attribute order', () => {
    const c = parseSocialCaption(FIXTURE);
    assert.deepEqual(c, {
      title: 'Utah Mammoth (@utahmammoth)',
      caption: 'Let’s set a world record together ... We got this 🙌\n\n#LikeTheEgg',
    });
  });
  test('null when no OG text', () => {
    assert.equal(parseSocialCaption('<html><head><title>x</title></head></html>'), null);
  });
  test('title only', () => {
    assert.deepEqual(parseSocialCaption(`<meta property='og:title' content='A (@a)'>`), { title: 'A (@a)', caption: null });
  });
});

describe('formatSocialCaption', () => {
  test('small title line and blockquoted caption (every line)', () => {
    const out = formatSocialCaption(parseSocialCaption(FIXTURE)!);
    assert.equal(out, '-# Utah Mammoth (@utahmammoth)\n> Let’s set a world record together ... We got this 🙌\n>\n> #LikeTheEgg');
  });
  test('truncates long captions without splitting emoji', () => {
    const out = formatSocialCaption({ title: null, caption: '🙌'.repeat(400) }, 300)!;
    assert.ok(out.startsWith('> '));
    assert.ok(out.endsWith('…'));
    assert.equal(Array.from(out.slice(2, -1)).length, 300);
  });
  test('null for empty', () => {
    assert.equal(formatSocialCaption({ title: null, caption: null }), null);
  });
});

describe('isInstagramLink', () => {
  test('matches vxinstagram/instagram posts and reels only', () => {
    assert.equal(isInstagramLink('https://vxinstagram.com/reel/abc'), true);
    assert.equal(isInstagramLink('https://www.instagram.com/p/abc/'), true);
    assert.equal(isInstagramLink('https://fxtwitter.com/a/status/1'), false);
    assert.equal(isInstagramLink('https://instagram.com/someuser'), false);
  });
});
