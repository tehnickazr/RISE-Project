/**
 * What a student is allowed to see of a scenario.
 *
 * `expected_answer` is the reference the model scores against — the answer key.
 * Rubric **weights** decide the mark. Both are teacher material: handing them to
 * a student before the interview does not just spoil the exercise, it
 * invalidates the measurement the October cohort exists to produce.
 *
 * The server still needs both to build its prompts; this only governs what is
 * serialised back to the browser.
 */
const TEACHER_ONLY_QUESTION_FIELDS = ['expected_answer'];

/**
 * A rubric with its name and nothing else.
 *
 * Rubrics used to be dropped for students entirely, which took the weights —
 * correct — and the **labels** with them. The feedback panel then had no name
 * for the competency it was showing a score for, and fell back to prettifying
 * the raw key, so a Serbian student read "Client focus" and "Resilience" in the
 * middle of Serbian feedback. Every student saw that, in all four languages.
 *
 * The label gives nothing away. The student is already being shown the score
 * for that competency; the only question was whether they were shown its name
 * in their own language or in English. Weight and description still go.
 */
function rubricNameOnly(rubric) {
  return {
    competency: rubric.competency,
    label_sr: rubric.label_sr,
    label_en: rubric.label_en,
    label_fr: rubric.label_fr,
    label_pt: rubric.label_pt,
  };
}

export function scenarioForRole(scenario, role) {
  if (!scenario || role === 'teacher' || role === 'admin') return scenario;
  return {
    ...scenario,
    questions: (scenario.questions ?? []).map(stripQuestion),
    rubrics: (scenario.rubrics ?? []).map(rubricNameOnly),
  };
}

export function stripQuestion(question) {
  const out = { ...question };
  for (const field of TEACHER_ONLY_QUESTION_FIELDS) delete out[field];
  return out;
}

/** History rows carry the same key, for the same reason. */
export function historyForRole(history, role) {
  if (role === 'teacher' || role === 'admin') return history;
  return (history ?? []).map(stripQuestion);
}
