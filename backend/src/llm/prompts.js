import { z } from 'zod';
import { renderPromptTemplate } from './promptTemplates.js';

export const FeedbackSchema = z.object({
  // Variable length by design — the model omits criteria the answer gave no
  // evidence for. At least the question's primary criterion must come back.
  per_criterion: z
    .array(
      z.object({
        competency: z.string().min(1),
        score: z.number().min(0).max(5),
        comment: z.string().min(1),
      })
    )
    .min(1),
  strengths: z.string().min(1),
  improvements: z.string().min(1),
  improved_answer: z.string().min(1),
  overall_score: z.number().min(0).max(5),
});

export const SummarySchema = z.object({
  overall_score: z.number().min(0).max(5),
  strengths: z.string().min(1),
  improvements: z.string().min(1),
  encouragement: z.string().min(1),
});

const LANG_NAMES = {
  sr: 'Serbian (srpski)',
  en: 'Where the language requires gender agreement even in the second person, choose a phrasing that avoids it.',
  fr: 'French (français)',
  pt: 'Portuguese (português)',
};

/**
 * How to address the student without guessing their gender, per language.
 *
 * The prompt used to say "choose a phrasing that avoids it", which is abstract
 * and got improvised differently in every sentence: observed live in one Serbian
 * session were `povezao/la`, `istakao/la` and a bare masculine `pokušao`, all in
 * the same feedback.
 *
 * It is abstract because the grammar differs. Serbian is the hard case — its
 * ordinary past tense agrees with the subject, and coaching feedback is full of
 * past-tense verbs. French and Portuguese only trip on predicate adjectives,
 * because `avoir` compounds and the preterite do not agree.
 *
 * So the rule is mechanical and language-specific. Mechanical rules survive
 * translation into model behaviour; abstract ones get improvised.
 *
 * STRICT BOUNDARY: this text may only describe grammar. It must never change
 * what is rewarded, the scoring scale, the tone, or the rubric handling —
 * otherwise the instrument forks four ways and cross-language results stop
 * meaning the same thing.
 *
 * Examples are given in the target language on purpose. Quoting *English* words
 * here drags the whole reply into English — that regression is why the closing
 * language line exists.
 */
const GENDER_GUIDANCE = {
  sr:
    'Serbian marks gender on past-tense verbs and on adjectives, so three rules, all absolute. ' +
    '(1) NEVER write the word "si". Not once. Every "si + verb" guesses a gender. Make their ANSWER the subject instead: instead of "Odlično si povezao intuiciju sa procedurama" write "Tvoj odgovor odlično povezuje intuiciju sa procedurama"; instead of "Svestrano si istakao bezbednost" write "U tvom odgovoru bezbednost je na prvom mestu". This is still direct address — tvoj odgovor speaks to them. Present-tense verbs about them are safe and natural: prepoznaješ, pominješ, koristiš, razmišljaš. ' +
    '(2) The improved_answer is written in THEIR voice, in the first person, where "bih pregledao" and "pregledala bih" also mark gender. Write it in the PRESENT tense instead: "Prvo vizuelno pregledam prostor ispod vozila i proveravam odakle curi" — never "Prvo bih pregledao". Never write "sam" followed by a past-tense verb. ' +
    '(3) NEVER write a slashed or bracketed form anywhere, in any field. Not povezao/la, not mogao/la, not spreman/a, not smiren/a, not sam/a, not upoznat/a. If a word would need a slash, rewrite the sentence so the word is not needed.',
  fr: 'Where the language requires gender agreement even in the second person, choose a phrasing that avoids it.',
  pt: 'Where the language requires gender agreement even in the second person, choose a phrasing that avoids it.',
  en: 'Where the language requires gender agreement even in the second person, choose a phrasing that avoids it.',
};

function localized(row, field, lang) {
  return row[`${field}_${lang}`] || row[`${field}_en`] || row[`${field}_sr`] || '';
}

/**
 * Rubrics are defined per scenario, but each question probes one competency.
 * Scoring every criterion on every answer means most scores are guesses — a
 * fault-diagnosis question was coming back with `continuous_learning: 1`, which
 * drags the overall score down for something the question never asked about.
 *
 * Mark the criterion the question actually targets and let the model omit the
 * ones the answer gives no evidence for.
 */
function rubricBlock(rubrics, lang, primaryCompetency) {
  return rubrics
    .map((r) => {
      const label = localized(r, 'label', lang);
      const desc = localized(r, 'description', lang);
      const mark = r.competency === primaryCompetency ? ' [PRIMARY — this question targets it]' : '';
      // `key=` is spelled out because a bare `safety ("Безбедност")` reads as if
      // the quoted translation were the name: models returned the localized
      // label as the competency, which renders fine but silently breaks
      // aggregation across attempts and languages. normalizeFeedbackCompetencies
      // repairs it either way; this just makes it rare rather than routine.
      return `- key=${r.competency} | label "${label}" | weight ${r.weight}${mark}: ${desc}`;
    })
    .join('\n');
}

/**
 * Map returned competency names back onto rubric keys.
 *
 * The model is asked for the key and usually gives it, but under a localized
 * rubric it sometimes echoes the translated label instead. The frontend hides
 * this — an unknown competency falls back to displaying itself, and a label
 * displays as a label — so it would otherwise surface only months later, as
 * pre/post comparisons that fail to line up.
 *
 * Unmatched names pass through unchanged: the competency vocabulary is open,
 * and content authors legitimately introduce keys with no rubric row.
 */
export function normalizeFeedbackCompetencies(feedback, rubrics) {
  const byName = new Map();
  for (const r of rubrics ?? []) {
    if (!r?.competency) continue;
    byName.set(r.competency.toLowerCase(), r.competency);
    for (const [field, value] of Object.entries(r)) {
      if (!field.startsWith('label_') || typeof value !== 'string') continue;
      const key = value.trim().toLowerCase();
      if (key) byName.set(key, r.competency);
    }
  }

  return {
    ...feedback,
    per_criterion: feedback.per_criterion.map((c) => {
      // The rubric is given to the model as `- key=technical_knowledge | label
      // "…"`, and it sometimes copies the whole token back rather than the key
      // alone. Measured on production: 14 rows across five competencies stored
      // as `key=ethics`, `key=resilience` and so on. They pass the schema —
      // competency is a free string — and the frontend renders an unknown key
      // as itself, so a bar simply appeared labelled `key=ethics` and nobody
      // read it as a defect. Stripped here, at the point that already exists to
      // repair competency names, rather than at each place that reads them.
      const raw = String(c.competency ?? '').trim().replace(/^key=/i, '');
      const match = byName.get(raw.toLowerCase());
      const competency = match ?? raw;
      return competency !== c.competency ? { ...c, competency } : c;
    }),
  };
}

/**
 * Anchor the model to what a good answer should contain.
 *
 * Measured effect: +0.52 separation between strong and weak answers, better on
 * 10 of 10 test questions. Both the terse French style ("Pipe cutter, deburring,
 * safety") and the longer Portuguese assessor-note style score identically, so
 * the text is passed through as the author wrote it.
 *
 * Returns '' when a question has no expected answer — Serbian content has none
 * and must keep scoring exactly as before.
 */
function expectedAnswerBlock(question, languageName) {
  const expected = (question.expected_answer ?? '').trim();
  if (!expected) return '';
  return [
    '',
    `KEY POINTS EXPECTED IN A GOOD ANSWER (guidance for you as the assessor — the candidate is NOT expected to use these words, and all your comments still go in ${languageName}):`,
    expected,
    'Use this to judge whether the answer has the right substance. Do not penalise different wording, a different order, or extra valid content that is not listed here.',
  ].join('\n');
}

export function buildAnswerFeedbackMessages({ scenario, question, answer, rubrics, language }) {
  const langName = LANG_NAMES[language] ?? LANG_NAMES.en;
  const questionText = localized(question, 'question', language);
  const scenarioTitle = localized(scenario, 'title', language);
  const scenarioDesc = localized(scenario, 'description', language);
  const values = {
    languageName: langName,
    genderGuidance: GENDER_GUIDANCE[language] ?? GENDER_GUIDANCE.en,
    scenarioTitle,
    scenarioDescription: scenarioDesc,
    rubricBlock: rubricBlock(rubrics, language, question.competency),
    questionText,
    expectedBlock: expectedAnswerBlock(question, langName),
    answer,
  };

  return [
    {
      role: 'system',
      content: renderPromptTemplate('answer-feedback.system.md', values),
    },
    {
      role: 'user',
      content: renderPromptTemplate('answer-feedback.user.md', values),
    },
  ];
}

export function buildSessionSummaryMessages({ scenario, perAnswer, language }) {
  const langName = LANG_NAMES[language] ?? LANG_NAMES.en;
  const scenarioTitle = localized(scenario, 'title', language);

  // The summary used to see only the questions, answers and scores. With no
  // reference for what a complete answer contains, it judged from its own
  // knowledge of the trade — accurate on familiar work, wrong on specialised
  // work, which is most of the catalogue. It also discarded the per-answer
  // critique that had already been written. Both go in now.
  const answersBlock = perAnswer
    .map((a, i) => {
      const q = localized(a, 'question', language);
      const lines = [`Q${i + 1}: ${q}`];
      const expected = (a.expected_answer ?? '').trim();
      if (expected) lines.push(`Key points a complete answer should contain: ${expected}`);
      lines.push(
        `Answer: ${a.answer}`,
        `Per-criterion scores: ${a.feedback.per_criterion
          .map((c) => `${c.competency}=${c.score}`)
          .join(', ')}`,
        `Overall: ${a.feedback.overall_score}`
      );
      const improvements = (a.feedback.improvements ?? '').trim();
      if (improvements) lines.push(`What this answer was missing: ${improvements}`);
      return lines.join('\n');
    })
    .join('\n\n');
  const values = {
    languageName: langName,
    genderGuidance: GENDER_GUIDANCE[language] ?? GENDER_GUIDANCE.en,
    scenarioTitle,
    answeredCount: perAnswer.length,
    answersBlock,
  };

  return [
    {
      role: 'system',
      content: renderPromptTemplate('session-summary.system.md', values),
    },
    {
      role: 'user',
      content: renderPromptTemplate('session-summary.user.md', values),
    },
  ];
}
