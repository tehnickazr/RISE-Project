// Who gets stopped and shown the privacy notice.
//
// Two questions were answered by one number until this test existed: which text
// is current, and which changes are worth interrupting a reader for. Conflating
// them stopped twenty-three people on production who had nothing new to read.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTICE_REQUIRES_ACK,
  NOTICE_VERSION,
  needsAcknowledgement,
} from '../../frontend/src/content/notice.js';

test('somebody who has never been shown it is always stopped', () => {
  assert.equal(needsAcknowledgement(null), true);
  assert.equal(needsAcknowledgement(undefined), true);
  assert.equal(needsAcknowledgement(''), true);
});

// 1.1 added voice input: a new processing operation on a new category of data.
// Anybody who last read 1.0 has not been told about it.
test('a stamp older than the last material version is stopped', () => {
  assert.equal(needsAcknowledgement('1.0'), true);
});

// The case this rule exists for. 1.2 fills in blanks the notice already
// promised and makes one statement in the reader's favour; it adds no data, no
// recipient, no purpose and no retention.
test('a stamp at the last material version is not stopped', () => {
  assert.equal(needsAcknowledgement(NOTICE_REQUIRES_ACK), false);
  assert.equal(needsAcknowledgement('1.1'), false);
});

test('a stamp at the current version is not stopped', () => {
  assert.equal(needsAcknowledgement(NOTICE_VERSION), false);
});

// Sorting dotted versions as strings puts '1.10' before '1.9', which would
// quietly stop everybody on the tenth revision.
test('versions compare as numbers, not as strings', () => {
  assert.equal(needsAcknowledgement('1.10'), false);
  assert.equal(needsAcknowledgement('0.9'), true);
});

test('the material version is never ahead of the current one', () => {
  const n = (v) => v.split('.').map(Number);
  const [a, b] = [n(NOTICE_REQUIRES_ACK), n(NOTICE_VERSION)];
  assert.ok(a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]),
    'NOTICE_REQUIRES_ACK must not exceed NOTICE_VERSION');
});
