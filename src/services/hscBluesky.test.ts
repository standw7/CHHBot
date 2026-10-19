import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isTeamImpactCard, parseImpactCards, buildImpactCardEmbed } from './hscBluesky.js';

const DID = 'did:plc:yhovbu5zkl6qxr2lz7znals5';
function item(rkey: string, text: string, opts: { images?: boolean; reason?: boolean; reply?: boolean } = {}) {
  const { images = true, reason = false, reply = false } = opts;
  return {
    post: {
      uri: `at://${DID}/app.bsky.feed.post/${rkey}`,
      record: { text, createdAt: '2026-10-18T04:46:00.000Z', ...(reply ? { reply: { root: {}, parent: {} } } : {}) },
      ...(images
        ? { embed: { $type: 'app.bsky.embed.images#view', images: [{ fullsize: `https://cdn.bsky.app/img/feed_fullsize/plain/${DID}/${rkey}img`, alt: 'card' }] } }
        : {}),
    },
    ...(reason ? { reason: { $type: 'app.bsky.feed.defs#reasonRepost' } } : {}),
  };
}

const UTA_TEXT = '#NHL Game Score Impact Card for Utah Mammoth on 2026-10-17:\n\n#TusksUp';
const feed = {
  feed: [
    item('3top', 'Top and bottom skaters from yesterdays games on 2026-10-17: Utah Mammoth had a night'),
    item('3edm', '#NHL Game Score Impact Card for Edmonton Oilers on 2026-10-17:\n\n#LetsGoOilers'),
    item('3uta', UTA_TEXT),
    item('3rep', UTA_TEXT, { reason: true }),
    item('3rpl', UTA_TEXT, { reply: true }),
    item('3noimg', UTA_TEXT, { images: false }),
  ],
};

describe('isTeamImpactCard', () => {
  test('matches the team card, not other teams or other post types', () => {
    assert.equal(isTeamImpactCard(UTA_TEXT, 'Utah Mammoth'), true);
    assert.equal(isTeamImpactCard('#NHL Game Score Impact Card for Edmonton Oilers on 2026-10-17:', 'Utah Mammoth'), false);
    assert.equal(isTeamImpactCard('Top and bottom skaters … Utah Mammoth', 'Utah Mammoth'), false);
  });
});

describe('parseImpactCards', () => {
  test('keeps only original, image-bearing team cards', () => {
    const cards = parseImpactCards(feed, 'Utah Mammoth');
    assert.deepEqual(cards.map(c => c.rkey), ['3uta']);
    assert.equal(cards[0].imageUrl, `https://cdn.bsky.app/img/feed_fullsize/plain/${DID}/3utaimg`);
    assert.equal(cards[0].uri, `at://${DID}/app.bsky.feed.post/3uta`);
  });

  test('malformed feed → empty', () => {
    assert.deepEqual(parseImpactCards({}, 'Utah Mammoth'), []);
    assert.deepEqual(parseImpactCards(null, 'Utah Mammoth'), []);
  });
});

describe('buildImpactCardEmbed', () => {
  test('title with the game date, credit link with the rkey, image', () => {
    const [card] = parseImpactCards(feed, 'Utah Mammoth');
    const embed = buildImpactCardEmbed(card).data;
    assert.equal(embed.title, '📊 Game Score Impact Card · 2026-10-17');
    assert.equal(embed.description, '[via HockeyStatCards](https://bsky.app/profile/hockeystatcards.com/post/3uta)');
    assert.equal(embed.image?.url, card.imageUrl);
  });
});
