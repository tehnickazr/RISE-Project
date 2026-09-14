import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFeedbackCompetencies } from '../src/llm/prompts.js';
import { dedupeCriteria } from '../src/sessions/criteria.js';

const RUBRICS = [
  { competency: 'technical_knowledge', label_sr: 'Stručno znanje', label_en: 'Technical knowledge' },
  { competency: 'ethics', label_sr: 'Etika', label_en: 'Ethics' },
];

const fb = (perCriterion) => ({
  per_criterion: perCriterion,
  strengths: 's', improvements: 'i', improved_answer: 'a', overall_score: 4,
});

// --- normalizeFeedbackCompetencies -----------------------------------------

test('a `key=` prefix echoed from the prompt is stripped', () => {
  // The rubric is given to the model as `- key=ethics | label "…"`, and it
  // sometimes copies the whole token. 14 such rows exist on production.
  const out = normalizeFeedbackCompetencies(
    fb([{ competency: 'key=ethics', score: 3, comment: 'c' }]),
    RUBRICS
  );
  assert.equal(out.per_criterion[0].competency, 'ethics');
});

test('the prefix is stripped even for a competency with no rubric row', () => {
  // The vocabulary is open — demo scenarios use competencies no rubric defines.
  const out = normalizeFeedbackCompetencies(
    fb([{ competency: 'key=adaptability', score: 2, comment: 'c' }]),
    RUBRICS
  );
  assert.equal(out.per_criterion[0].competency, 'adaptability');
});

test('a translated label still maps back to the rubric key', () => {
  const out = normalizeFeedbackCompetencies(
    fb([{ competency: 'Stručno znanje', score: 4, comment: 'c' }]),
    RUBRICS
  );
  assert.equal(out.per_criterion[0].competency, 'technical_knowledge');
});

test('a correct key is left exactly as it is', () => {
  const input = fb([{ competency: 'ethics', score: 5, comment: 'c' }]);
  const out = normalizeFeedbackCompetencies(input, RUBRICS);
  assert.equal(out.per_criterion[0].competency, 'ethics');
  assert.equal(out.per_criterion[0], input.per_criterion[0], 'unchanged entries keep identity');
});

test('an unknown competency passes through rather than being dropped', () => {
  const out = normalizeFeedbackCompetencies(
    fb([{ competency: 'brand_fundamentals', score: 3, comment: 'c' }]),
    RUBRICS
  );
  assert.equal(out.per_criterion[0].competency, 'brand_fundamentals');
});

test('surrounding whitespace does not defeat the match', () => {
  const out = normalizeFeedbackCompetencies(
    fb([{ competency: '  key=Ethics  ', score: 1, comment: 'c' }]),
    RUBRICS
  );
  assert.equal(out.per_criterion[0].competency, 'ethics');
});

// --- dedupeCriteria ---------------------------------------------------------

test('one row per competency, first mention winning', () => {
  const rows = dedupeCriteria([
    { competency: 'ethics', score: 4, comment: 'c' },
    { competency: 'ethics', score: 1, comment: 'c' },
  ]);
  assert.deepEqual(rows, [{ competency: 'ethics', score: 4 }]);
});

test('entries the table could not store are dropped, not written as nulls', () => {
  const rows = dedupeCriteria([
    { competency: '', score: 3 },
    { competency: '   ', score: 3 },
    { competency: 'ethics', score: null },
    { competency: 'ethics', score: 'four' },
    { competency: 'resilience', score: 9 },
    { competency: 'authenticity', score: -1 },
    { competency: 'technical_knowledge', score: 0 },
  ]);
  assert.deepEqual(rows, [{ competency: 'technical_knowledge', score: 0 }]);
});

test('a zero score survives — it is a real score, not a missing one', () => {
  assert.deepEqual(
    dedupeCriteria([{ competency: 'ethics', score: 0 }]),
    [{ competency: 'ethics', score: 0 }]
  );
});

test('a fractional score is preserved', () => {
  assert.deepEqual(
    dedupeCriteria([{ competency: 'ethics', score: 3.5 }]),
    [{ competency: 'ethics', score: 3.5 }]
  );
});

test('missing or empty input yields no rows rather than throwing', () => {
  assert.deepEqual(dedupeCriteria(undefined), []);
  assert.deepEqual(dedupeCriteria([]), []);
});
