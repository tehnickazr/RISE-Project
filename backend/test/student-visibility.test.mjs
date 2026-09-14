import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarioForRole } from '../src/sheets/visibility.js';

const scenario = {
  scenario_id: 'serv-comm',
  questions: [{ question_id: 'q1', question_sr: 'Pitanje', expected_answer: 'THE ANSWER KEY' }],
  rubrics: [{
    rubric_id: 'r1', scenario_id: 'serv-comm', competency: 'client_focus',
    label_sr: 'Usmerenost ka klijentu', label_en: 'Client focus',
    label_fr: '', label_pt: '',
    description_sr: 'Kako student…', description_en: 'How the student…',
    weight: 0.35,
  }],
};

test('a student never receives the answer key', () => {
  const out = scenarioForRole(scenario, 'student');
  assert.equal(out.questions[0].expected_answer, undefined);
  assert.doesNotMatch(JSON.stringify(out), /ANSWER KEY/);
});

test('a student never receives rubric weights', () => {
  const out = scenarioForRole(scenario, 'student');
  assert.equal(out.rubrics[0].weight, undefined);
  assert.doesNotMatch(JSON.stringify(out), /0\.35/);
});

test('a student never receives rubric descriptions', () => {
  const out = scenarioForRole(scenario, 'student');
  assert.equal(out.rubrics[0].description_sr, undefined);
  assert.equal(out.rubrics[0].description_en, undefined);
});

test('a student DOES receive the competency name, in every language', () => {
  // Without this the feedback panel has no name for the competency it is
  // showing a score for, and prettifies the raw key — so a Serbian student
  // read "Client focus" in the middle of Serbian feedback.
  const out = scenarioForRole(scenario, 'student');
  assert.equal(out.rubrics[0].competency, 'client_focus');
  assert.equal(out.rubrics[0].label_sr, 'Usmerenost ka klijentu');
  assert.equal(out.rubrics[0].label_en, 'Client focus');
});

test('a teacher receives everything, untouched', () => {
  const out = scenarioForRole(scenario, 'teacher');
  assert.equal(out, scenario);
  assert.equal(out.rubrics[0].weight, 0.35);
  assert.equal(out.questions[0].expected_answer, 'THE ANSWER KEY');
});

test('an admin is treated as a teacher here — content is not personal data', () => {
  assert.equal(scenarioForRole(scenario, 'admin'), scenario);
});

test('a scenario with no rubrics does not crash', () => {
  const out = scenarioForRole({ scenario_id: 'x', questions: [] }, 'student');
  assert.deepEqual(out.rubrics, []);
});
