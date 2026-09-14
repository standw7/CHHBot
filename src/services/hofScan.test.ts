import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { qualifiesForHof, HOF_EMOJIS } from './hofScan.js';

describe('qualifiesForHof', () => {
  test('meets threshold on 🔥', () => {
    const result = qualifiesForHof(
      [{ emojiName: '🔥', count: 8 }],
      8,
      HOF_EMOJIS
    );
    assert.equal(result, true);
  });

  test('meets threshold on 😂', () => {
    const result = qualifiesForHof(
      [{ emojiName: '😂', count: 10 }],
      8,
      HOF_EMOJIS
    );
    assert.equal(result, true);
  });

  test('non-qualifying emoji with high count does not qualify', () => {
    const result = qualifiesForHof(
      [{ emojiName: '👍', count: 100 }],
      8,
      HOF_EMOJIS
    );
    assert.equal(result, false);
  });

  test('below threshold does not qualify', () => {
    const result = qualifiesForHof(
      [{ emojiName: '🔥', count: 7 }],
      8,
      HOF_EMOJIS
    );
    assert.equal(result, false);
  });

  test('qualifies when any one of multiple reactions meets threshold', () => {
    const result = qualifiesForHof(
      [
        { emojiName: '👍', count: 50 },
        { emojiName: '🤣', count: 9 },
      ],
      8,
      HOF_EMOJIS
    );
    assert.equal(result, true);
  });

  test('null emoji name does not qualify', () => {
    const result = qualifiesForHof(
      [{ emojiName: null, count: 100 }],
      8,
      HOF_EMOJIS
    );
    assert.equal(result, false);
  });
});
