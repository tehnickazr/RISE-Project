import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectQuestions,
  quotaFor,
  TYPE_QUOTA,
  DEFAULT_SESSION_LENGTH,
} from '../src/sessions/sampler.js';

/** A bank with `n` questions of each type, ordered general-first. */
function bank({ general = 3, technical = 12, situational = 8, behavioral = 4, trap = 3 } = {}) {
  const counts = { general, technical, situational, behavioral, trap };
  const questions = [];
  let order = 1;
  for (const [type, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) {
      questions.push({ question_id: `${type}-${i}`, type, order: order++ });
    }
  }
  return { scenario_id: 'test', questions };
}

const session = (student = 's1', attempt = 1) => ({ student_id: student, attempt_number: attempt });

test('the interview opens on the lowest-order general question', () => {
  const scenario = bank();
  for (let i = 0; i < 40; i++) {
    const picked = selectQuestions(scenario, session(`student-${i}`));
    assert.equal(picked[0].question_id, 'general-0', `attempt ${i} did not open on the opener`);
  }
});

test('a bank whose opener sits late still opens on it', () => {
  // The four French scenarios that prompted this: the self-presentation
  // question was carried in but trade questions had lower `order`.
  const scenario = {
    scenario_id: 'late-opener',
    questions: [
      { question_id: 'tech-a', type: 'technical', order: 1 },
      { question_id: 'tech-b', type: 'technical', order: 2 },
      { question_id: 'opener', type: 'general', order: 3 },
      ...Array.from({ length: 18 }, (_, i) => ({
        question_id: `filler-${i}`, type: 'situational', order: 4 + i,
      })),
    ],
  };
  const picked = selectQuestions(scenario, session());
  assert.equal(picked[0].question_id, 'opener');
});

test('pinning the opener does not lengthen the interview', () => {
  const picked = selectQuestions(bank(), session());
  assert.equal(picked.length, DEFAULT_SESSION_LENGTH);
});

test('the opener is spent from the general quota, not added to it', () => {
  const quota = new Map(TYPE_QUOTA);
  const picked = selectQuestions(bank(), session());
  const generals = picked.filter((q) => q.type === 'general');
  assert.equal(generals.length, quota.get('general'));
});

test('selection stays deterministic for the same student and attempt', () => {
  const scenario = bank();
  const a = selectQuestions(scenario, session('s1', 2)).map((q) => q.question_id);
  const b = selectQuestions(scenario, session('s1', 2)).map((q) => q.question_id);
  assert.deepEqual(a, b);
});

test('a second attempt draws a different set behind the opener', () => {
  const scenario = bank();
  const first = selectQuestions(scenario, session('s1', 1)).map((q) => q.question_id);
  const second = selectQuestions(scenario, session('s1', 2)).map((q) => q.question_id);
  assert.equal(first[0], second[0], 'both should still open on the opener');
  assert.notDeepEqual(first.slice(1), second.slice(1));
});

test('a bank with no general question is still served', () => {
  const scenario = {
    scenario_id: 'no-general',
    questions: Array.from({ length: 20 }, (_, i) => ({
      question_id: `t-${i}`, type: 'technical', order: i + 1,
    })),
  };
  const picked = selectQuestions(scenario, session());
  assert.equal(picked.length, DEFAULT_SESSION_LENGTH);
});

test('a shortened interview still covers every question type', () => {
  // The regression: filling the ten-question quota and then slicing to five
  // returned the opener plus four technical questions and nothing else.
  const picked = selectQuestions({ ...bank(), question_count: 5 }, session());
  const types = new Set(picked.map((q) => q.type));
  assert.equal(picked.length, 5);
  assert.deepEqual(
    [...types].sort(),
    ['behavioral', 'general', 'situational', 'technical', 'trap']
  );
});

test('a shortened interview still opens on the opener', () => {
  const picked = selectQuestions({ ...bank(), question_count: 5 }, session());
  assert.equal(picked[0].question_id, 'general-0');
});

test('the scaled quota always sums to the requested length', () => {
  for (let target = 1; target < 10; target += 1) {
    const total = quotaFor(target).reduce((n, [, want]) => n + want, 0);
    assert.equal(total, target, `quota for ${target} summed to ${total}`);
  }
});

test('the full-length quota is untouched, so old sessions stay comparable', () => {
  assert.equal(quotaFor(DEFAULT_SESSION_LENGTH), TYPE_QUOTA);
  assert.equal(quotaFor(30), TYPE_QUOTA);
});

test('a shortened interview is still mostly technical once there is room', () => {
  const quota = new Map(quotaFor(7));
  assert.equal(quota.get('technical'), 2);
  assert.equal(quota.get('general'), 1);
});

test('a bank shorter than the session length is served whole, in order', () => {
  const scenario = {
    scenario_id: 'short',
    questions: [
      { question_id: 'b', type: 'technical', order: 2 },
      { question_id: 'a', type: 'general', order: 1 },
    ],
  };
  const picked = selectQuestions(scenario, session());
  assert.deepEqual(picked.map((q) => q.question_id), ['a', 'b']);
});
