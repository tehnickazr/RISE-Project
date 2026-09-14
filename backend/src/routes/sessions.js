import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { requireAuth, withActor } from '../auth/middleware.js';
import { studentVisibilityClause, teacherMaySeeStudent } from '../db/scope.js';
import { effectiveLimits, usageForStudent } from '../db/limits.js';
import { checkStart, cooldownUntil, remaining } from '../sessions/limits.js';
import { pool } from '../db/pool.js';
import { recordRead } from '../db/audit.js';
import {
  currentVersionId,
  loadScenarioForVersion,
  versionForSession,
} from '../content/store.js';
import { historyForRole, scenarioForRole, stripQuestion } from '../sheets/visibility.js';
import { callLlmJson, SUMMARY_TIMEOUT_MS } from '../llm/llm.js';
import {
  SUPPORTED_AUDIO_TYPES,
  TranscriptionError,
  isSupportedAudioType,
  transcribe,
} from '../llm/transcribe.js';
import { isSupportedLanguage, supportedLanguageMessage } from '../i18n/languages.js';
import {
  FeedbackSchema,
  SummarySchema,
  buildAnswerFeedbackMessages,
  buildSessionSummaryMessages,
  normalizeFeedbackCompetencies,
} from '../llm/prompts.js';

export const sessionsRouter = express.Router();

/**
 * Load a session and authorize. Students can only see their own sessions;
 * teachers can see anything (for review). Returns the session row or null.
 */
async function loadOwnedSession(sessionId, user) {
  const { rows } = await pool.query(
    `SELECT s.*, u.display_name AS student_name, u.email AS student_email
     FROM interview_sessions s JOIN users u ON u.id = s.student_id
     WHERE s.id = $1`,
    [sessionId]
  );
  const session = rows[0];
  if (!session) return null;
  if (user.role === 'student') {
    return session.student_id === user.id ? session : null;
  }
  // A teacher reaches a session only through the student it belongs to. This
  // used to return any session to any teacher, across all three partners.
  if (user.role === 'teacher') {
    return (await teacherMaySeeStudent(user, session.student_id)) ? session : null;
  }
  return null;
}

/**
 * The signed-in person, with their organization.
 *
 * `withActor` has already loaded and validated this — including refusing a
 * suspended organization — so this hands back what it found rather than asking
 * again. Two lookups per request that could disagree with each other is one
 * lookup too many when the disagreement decides who sees whose transcript.
 */
function loadCurrentUser(req) {
  return req.actor;
}

/**
 * Reconstruct the per-question history (question/answer/feedback triples) for a
 * session. Used both for replay and for building the final summary prompt.
 */
async function loadSessionHistory(session, scenario) {
  const { rows: feedbackRows } = await pool.query(
    `SELECT question_id, student_answer, ai_feedback_json, overall_score, created_at
     FROM answer_feedback
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [session.id]
  );
  const byQuestionId = new Map(feedbackRows.map((r) => [r.question_id, r]));

  return scenario.questions
    .filter((q) => byQuestionId.has(q.question_id))
    .map((q) => {
      const fb = byQuestionId.get(q.question_id);
      return {
        question_id: q.question_id,
        order: q.order,
        question_sr: q.question_sr,
        question_en: q.question_en,
        question_fr: q.question_fr,
        question_pt: q.question_pt,
        type: q.type,
        competency: q.competency,
        // Needed by the session summary so it can judge completeness against
        // the same reference the per-answer feedback used.
        expected_answer: q.expected_answer,
        answer: fb.student_answer,
        feedback: fb.ai_feedback_json,
        overall_score: fb.overall_score == null ? null : Number(fb.overall_score),
      };
    });
}

async function loadSessionSummary(sessionId) {
  const { rows } = await pool.query(
    `SELECT content FROM interview_messages
     WHERE session_id = $1 AND message_type = 'summary'
     ORDER BY created_at DESC LIMIT 1`,
    [sessionId]
  );
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].content);
  } catch {
    return null;
  }
}

/**
 * Generate the closing summary and store it. Returns the summary, or null if
 * the model call failed — never throws, because a session is finished when the
 * student has answered every question, not when this second call succeeds.
 */
async function generateSessionSummary(session, scenario, history) {
  try {
    const messages = buildSessionSummaryMessages({
      scenario,
      perAnswer: history,
      language: session.language,
    });
    const { data, model, usage, pricing } = await callLlmJson(messages, SummarySchema, {
      label: 'summary',
      timeoutMs: SUMMARY_TIMEOUT_MS,
    });
    await pool.query(
      `INSERT INTO interview_messages
         (session_id, sender, message_type, content,
          llm_model, prompt_tokens, completion_tokens, total_tokens,
          cost_eur, co2e_g, water_l, pricing_version)
       VALUES ($1, 'ai', 'summary', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        session.id,
        JSON.stringify(data),
        model,
        usage?.prompt_tokens ?? null,
        usage?.completion_tokens ?? null,
        usage?.total_tokens ?? null,
        pricing?.cost_eur ?? null,
        pricing?.co2e_g ?? null,
        pricing?.water_l ?? null,
        pricing?.pricing_version ?? null,
      ]
    );
    return data;
  } catch (err) {
    console.error(`[sessions] summary failed for ${session.id}:`, err.message ?? err);
    return null;
  }
}

// Sessions currently being summarised, so a student refreshing an interview
// three times does not pay for three summaries. Process-local, which is enough
// while the platform runs as a single process; the worst case if that ever
// changes is a duplicate row, and `loadSessionSummary` takes the newest.
const summariesInFlight = new Map();

/**
 * Fill in a missing summary for a finished session, once.
 *
 * The closing call used to run inline on the last answer, and a failure there
 * left the session `in_progress` with every question answered — unrecoverable,
 * because the next submit hit the "already answered" check and never reached
 * the summary step again. Completion no longer depends on this call, so the
 * prose is recovered here instead, on the next read of the session.
 */
function recoverSessionSummary(session, scenario, history) {
  const existing = summariesInFlight.get(session.id);
  if (existing) return existing;
  const pending = generateSessionSummary(session, scenario, history)
    .finally(() => summariesInFlight.delete(session.id));
  summariesInFlight.set(session.id, pending);
  return pending;
}

// ---------- Question selection ----------

// The logic lives in ../sessions/sampler.js, which has no database dependency.
// Imported *and* re-exported: `export { x } from './y.js'` forwards the name to
// importers without binding it in this module's scope, so the two uses below
// threw ReferenceError at runtime while every unit test passed — they import the
// sampler directly and never exercise this file.
import { DEFAULT_SESSION_LENGTH, TYPE_QUOTA, selectQuestions } from '../sessions/sampler.js';
import { dedupeCriteria } from '../sessions/criteria.js';

export { DEFAULT_SESSION_LENGTH, TYPE_QUOTA, selectQuestions };

// A guard rail against runaway cost and abuse, not a word limit. The longest
// answer any student has written is 625 characters; 4 000 is roughly 650 words,
// far beyond a spoken interview answer, and it caps the session summary — which
// embeds all ten answers — at a comfortable prompt size.
//
// Published to the client in the session payload rather than duplicated there:
// two hardcoded copies would drift the moment this env var is changed, and the
// counter would start lying with nothing to signal it.
const MAX_ANSWER_CHARS = Number(process.env.MAX_ANSWER_CHARS ?? 4000);

/** Compute the next unanswered question for a session. */
function nextQuestion(scenario, history, session, role) {
  const answered = new Set(history.map((h) => h.question_id));
  const question =
    selectQuestions(scenario, session).find((q) => !answered.has(q.question_id)) ?? null;
  // The question the student is about to answer carries its own expected
  // answer. Sending it is the most direct way to hand over the answer key.
  if (!question) return null;
  return role === 'teacher' || role === 'admin' ? question : stripQuestion(question);
}

/**
 * The scenario as this session sees it: only the questions actually being
 * asked. Sending the whole bank would make the progress counter wrong ("1 of
 * 30" when ten are served) and would hand the browser questions the student has
 * not reached — including the answers to trap questions.
 */
function scenarioForSession(scenario, session, role) {
  return scenarioForRole(
    { ...scenario, questions: selectQuestions(scenario, session) },
    role
  );
}

function scenarioSupportsLanguage(scenario, language) {
  return (scenario.language ?? '')
    .split(',')
    .map((value) => value.trim())
    .includes(language);
}

// ---------- Routes ----------

/** Start a new interview session. Body: { scenario_id, language? } */
sessionsRouter.post('/', requireAuth, withActor, async (req, res) => {
  try {
    const user = await loadCurrentUser(req);
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'only students can start sessions' });
    }
    const { scenario_id } = req.body ?? {};
    if (!scenario_id) return res.status(400).json({ error: 'scenario_id is required' });

    // Started against whatever is current now, and pinned to it below, so a
    // later sync cannot change the interview under the student's feet.
    const startVersionId = await currentVersionId(user.org_id);
    const scenario = startVersionId
      ? await loadScenarioForVersion(startVersionId, scenario_id)
      : null;
    if (!scenario) return res.status(404).json({ error: 'scenario not found' });
    // Retired content still loads — past interviews have to keep opening — but
    // no new interview may be started on it. The list endpoint already hides
    // these; this is the guard for anyone calling the API directly.
    if (!scenario.active) {
      return res.status(409).json({ error: 'scenario is retired' });
    }

    const language = req.body.language ?? user.preferred_language ?? 'en';
    if (!isSupportedLanguage(language)) {
      return res.status(400).json({ error: supportedLanguageMessage() });
    }
    if (!scenarioSupportsLanguage(scenario, language)) {
      return res.status(400).json({ error: 'scenario is not available in this language' });
    }

    // The allowance. Checked here and nowhere else: this is the only route that
    // creates a session, so it is the only place a limit can be reached without
    // also being able to strand an interview somebody is halfway through.
    //
    // Two students starting at the same instant can both pass this and take the
    // count one over — the check reads and the insert writes, with no lock
    // between them. Left as it is on purpose. A per-student counter row or a
    // SELECT FOR UPDATE would serialise every start in the platform to remove,
    // at worst, one extra interview for one student. The limit is a guard rail
    // against a runaway bill, not a ledger.
    const { limits } = await effectiveLimits(user.org_id);
    const usage = await usageForStudent(user.id);
    const refusal = checkStart({
      limits,
      totalStarted: usage.total,
      scenarioStarted: usage.perScenario[scenario_id] ?? 0,
      // This scenario's own clock, and no other's.
      scenarioLastStartedAt: usage.lastStartedPerScenario[scenario_id] ?? null,
    });
    if (refusal) {
      // 409, not 403: nothing about who they are forbids this. The state of
      // their own account does, and it is a state they can read on the page.
      return res.status(409).json(refusal);
    }

    // Compute attempt_number for (student, scenario)
    const { rows: attemptRows } = await pool.query(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next
       FROM interview_sessions WHERE student_id = $1 AND scenario_id = $2 AND language = $3`,
      [user.id, scenario_id, language]
    );
    const attempt = attemptRows[0].next;

    const { rows: insertRows } = await pool.query(
      `INSERT INTO interview_sessions
         (student_id, scenario_id, language, status, attempt_number, content_version_id)
       VALUES ($1, $2, $3, 'in_progress', $4, $5)
       RETURNING *`,
      [user.id, scenario_id, language, attempt, startVersionId]
    );
    const session = insertRows[0];

    res.json({
      session,
      scenario: scenarioForSession(scenario, session, user.role),
      next_question: nextQuestion(scenario, [], session, user.role),
      history: [],
      summary: null,
    });
  } catch (err) {
    console.error('[sessions] create failed:', err);
    res.status(500).json({ error: 'failed to create session' });
  }
});

/** Load a session + scenario + history (resume / replay). */
sessionsRouter.get('/:id', requireAuth, withActor, async (req, res) => {
  try {
    const user = await loadCurrentUser(req);
    const session = await loadOwnedSession(req.params.id, user);
    if (!session) return res.status(404).json({ error: 'session not found' });

    const scenario = await loadScenarioForVersion(
      await versionForSession(session, user.org_id),
      session.scenario_id
    );
    if (!scenario) return res.status(404).json({ error: 'scenario not found' });

    const history = await loadSessionHistory(session, scenario);
    let summary = await loadSessionSummary(session.id);

    // A finished session with no summary means the closing call failed when the
    // last answer was submitted. Try once here; a student who reloads the page
    // gets their wrap-up rather than a permanent gap. Teachers reading a session
    // do not trigger it — the spend belongs to the student's own interview.
    if (!summary && session.status === 'completed' && user.role === 'student' && history.length > 0) {
      summary = await recoverSessionSummary(session, scenario, history);
    }

    // The most sensitive read in the platform: a teacher sees the words the
    // student typed. Recorded after authorisation, so this logs reads rather
    // than attempts; a student opening their own session is filtered inside.
    await recordRead(user, {
      action: 'read_transcript',
      subjectId: session.student_id,
      subjectLabel: session.student_email,
      objectId: session.id,
    });

    res.json({
      session,
      scenario: scenarioForSession(scenario, session, user.role),
      history: historyForRole(history, user.role),
      next_question:
        session.status === 'in_progress'
          ? nextQuestion(scenario, history, session, user.role)
          : null,
      summary,
      summary_pending: session.status === 'completed' && !summary,
      limits: { answer_max_chars: MAX_ANSWER_CHARS },
    });
  } catch (err) {
    console.error('[sessions] load failed:', err);
    res.status(500).json({ error: 'failed to load session' });
  }
});

/** Submit an answer. Body: { question_id, answer }
 *  Persists the answer, calls the LLM for feedback, persists feedback, and
 *  returns the feedback + the next question (or triggers summary if last).
 */
sessionsRouter.post('/:id/answers', requireAuth, withActor, async (req, res) => {
  try {
    const user = await loadCurrentUser(req);
    const session = await loadOwnedSession(req.params.id, user);
    if (!session) return res.status(404).json({ error: 'session not found' });
    if (user.role !== 'student' || session.student_id !== user.id) {
      return res.status(403).json({ error: 'only the owning student can answer' });
    }
    if (session.status !== 'in_progress') {
      return res.status(409).json({ error: 'session is not in progress' });
    }

    const { question_id, answer, dictated } = req.body ?? {};
    if (!question_id || typeof answer !== 'string' || answer.trim().length === 0) {
      return res.status(400).json({ error: 'question_id and non-empty answer required' });
    }
    // Reported by the client, and trusted, because nothing rides on it that
    // would reward lying: it is not shown to a teacher, does not enter a score,
    // and exists only so the pilot can test the partners' claim that speaking
    // produces fuller answers than typing.
    const wasDictated = dictated === true;
    // Every character here is billed twice: once as prompt tokens on the answer
    // feedback call, again in the session summary. 8 000 characters is roughly
    // 1 300 words — far beyond any real spoken-interview answer, so a request
    // above it is a mistake or an attempt to run up the bill.
    if (answer.length > MAX_ANSWER_CHARS) {
      return res
        .status(400)
        .json({ error: `answer is too long (max ${MAX_ANSWER_CHARS} characters)` });
    }

    const scenario = await loadScenarioForVersion(
      await versionForSession(session, user.org_id),
      session.scenario_id
    );
    if (!scenario) return res.status(500).json({ error: 'scenario disappeared' });

    const question = scenario.questions.find((q) => q.question_id === question_id);
    if (!question) return res.status(400).json({ error: 'question_id not in scenario' });

    // Fast path: already answered. This is only an optimisation — two requests
    // arriving together both pass it, so the real guarantee is the unique
    // constraint on (session_id, question_id) enforced below.
    const { rows: dupRows } = await pool.query(
      `SELECT 1 FROM answer_feedback WHERE session_id = $1 AND question_id = $2`,
      [session.id, question_id]
    );
    if (dupRows.length > 0) {
      return res.status(409).json({ error: 'question already answered' });
    }

    // Call LLM for rubric feedback
    const messages = buildAnswerFeedbackMessages({
      scenario,
      question,
      answer,
      rubrics: scenario.rubrics,
      language: session.language,
    });
    const {
      data: rawFeedback,
      model: feedbackModel,
      usage: feedbackUsage,
      pricing: feedbackPricing,
    } = await callLlmJson(messages, FeedbackSchema, { label: 'feedback' });
    // Store rubric keys, never localized labels — progress across attempts is
    // aggregated on this field.
    const feedback = normalizeFeedbackCompetencies(rawFeedback, scenario.rubrics);

    // Persist the answer and its feedback together. One transaction, so a
    // concurrent duplicate cannot leave an orphaned answer message behind, and
    // ON CONFLICT makes the database — not the check above — the thing that
    // actually guarantees one answer per question.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: answerMsgRows } = await client.query(
        `INSERT INTO interview_messages (session_id, sender, message_type, question_id, content)
         VALUES ($1, 'student', 'answer', $2, $3) RETURNING id`,
        [session.id, question_id, answer]
      );
      const answerMessageId = answerMsgRows[0].id;

      const { rows: feedbackRows } = await client.query(
        `INSERT INTO answer_feedback (session_id, question_id, answer_message_id,
                                      student_answer, ai_feedback_json, overall_score,
                                      answer_char_count, dictated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (session_id, question_id) DO NOTHING
         RETURNING id`,
        [
          session.id, question_id, answerMessageId, answer, feedback,
          feedback.overall_score, answer.length, wasDictated,
        ]
      );

      if (feedbackRows.length === 0) {
        // Another request answered this question while the model was running.
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'question already answered' });
      }

      // Scores as rows, not only as JSON. The blob stays the record of what the
      // model said; these are the numbers the KPI is computed from, and they
      // have to be readable once the prose is encrypted. See migration 0014.
      //
      // Written in the same transaction as the feedback: a scored answer whose
      // scores are missing would be invisible in the report and present on the
      // page, which is worse than the answer failing outright.
      const scores = dedupeCriteria(feedback.per_criterion);
      if (scores.length > 0) {
        await client.query(
          `INSERT INTO answer_criterion_scores (answer_feedback_id, competency, score)
           SELECT $1, competency, score
           FROM unnest($2::text[], $3::numeric[]) AS t(competency, score)
           ON CONFLICT (answer_feedback_id, competency) DO NOTHING`,
          [feedbackRows[0].id, scores.map((c) => c.competency), scores.map((c) => c.score)]
        );
      }

      await client.query(
        `INSERT INTO interview_messages
           (session_id, sender, message_type, question_id, content,
            llm_model, prompt_tokens, completion_tokens, total_tokens,
            cost_eur, co2e_g, water_l, pricing_version)
         VALUES ($1, 'ai', 'feedback', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          session.id,
          question_id,
          JSON.stringify(feedback),
          feedbackModel,
          feedbackUsage?.prompt_tokens ?? null,
          feedbackUsage?.completion_tokens ?? null,
          feedbackUsage?.total_tokens ?? null,
          feedbackPricing?.cost_eur ?? null,
          feedbackPricing?.co2e_g ?? null,
          feedbackPricing?.water_l ?? null,
          feedbackPricing?.pricing_version ?? null,
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Compute next question
    const updatedHistory = await loadSessionHistory(session, scenario);
    const next = nextQuestion(scenario, updatedHistory, session, user.role);

    let summary = null;
    if (!next) {
      // Last question. The interview is over the moment the answer above is
      // committed — the summary is prose on top of it, and every number that
      // matters (avg_score, answered_count, the KPI export) comes from
      // `answer_feedback`. So mark the session completed regardless of whether
      // the closing call succeeds: letting a slow provider decide whether a
      // student who answered all ten questions counts as finished would corrupt
      // the completion rate, which is a reported KPI.
      summary = await generateSessionSummary(session, scenario, updatedHistory);
      await pool.query(
        `UPDATE interview_sessions SET status = 'completed', completed_at = now() WHERE id = $1`,
        [session.id]
      );
    }

    // `summary_pending` distinguishes "no summary because the interview is not
    // over" from "the interview is over and the wrap-up did not come back" —
    // the client can then say so, and the next load of the session recovers it.
    res.json({ feedback, next_question: next, summary, summary_pending: !next && !summary });
  } catch (err) {
    console.error('[sessions] answer failed:', err);
    res.status(500).json({ error: err.message ?? 'failed to evaluate answer' });
  }
});

// ---------- Dictation ----------

// Whisper accepts far larger files; this is a cost and abuse ceiling, not a
// format limit. At the rate MediaRecorder produces Opus, 8 MB is well over an
// hour of speech — orders of magnitude beyond the longest answer anyone has
// given (2 366 characters, roughly three minutes spoken).
const MAX_AUDIO_BYTES = Number(process.env.MAX_AUDIO_BYTES ?? 8 * 1024 * 1024);

// Below this, there is nothing to transcribe and Whisper's response to silence
// is to invent a subtitle (see looksLikeSilence in transcribe.js). Rejecting
// here costs the student nothing and saves a call that could only mislead them.
const MIN_AUDIO_BYTES = 2048;

// The cost ceiling, and the only one that matters: every call here spends money
// on someone else's account. Forty per hour is roughly four full re-recordings
// of every question in a ten-question interview — far more than an honest
// student needs, far less than a loop could spend.
//
// Keyed on the user, not the address, because a class shares one NAT address
// and thirty students dictating at once is the normal case, not the attack.
const dictationLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.DICTATION_RATE_LIMIT ?? 40),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.userId ?? ipKeyGenerator(req.ip),
  message: { error: 'too many recordings, please wait a little' },
});

/**
 * Transcribe a recording into text for the answer box.
 *
 * The transcript is handed back to the student to read and correct — it is
 * never submitted on their behalf. That is a fairness requirement rather than a
 * nicety: answers are scored against expected answers containing specific
 * technical terms, and vocational vocabulary is exactly where transcription
 * fails. A student marked down for what Whisper guessed they said would have a
 * legitimate complaint and no way to raise it.
 *
 * The audio is held in memory for the duration of one upstream call and then
 * dropped. It is never written to disk, never logged, and never stored — so
 * there is no recording of a minor's voice anywhere in this system, which is
 * what makes the privacy notice for this feature short.
 */
sessionsRouter.post(
  '/:id/transcribe',
  requireAuth,
  withActor,
  // Limiter ahead of the body parser deliberately: a rate-limited request
  // should be refused before eight megabytes are read off the socket.
  dictationLimit,
  express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }),
  async (req, res) => {
    try {
      const user = await loadCurrentUser(req);
      const session = await loadOwnedSession(req.params.id, user);
      if (!session) return res.status(404).json({ error: 'session not found' });
      // Teachers can open any session they are entitled to see. None of them
      // may spend on transcription — the feature belongs to the student taking
      // the interview, and this is the only place that would be billable.
      if (user.role !== 'student' || session.student_id !== user.id) {
        return res.status(403).json({ error: 'only the owning student can dictate' });
      }
      if (session.status !== 'in_progress') {
        return res.status(409).json({ error: 'session is not in progress' });
      }

      const contentType = req.get('content-type');
      if (!isSupportedAudioType(contentType)) {
        return res
          .status(415)
          .json({ error: `unsupported audio type (accepted: ${SUPPORTED_AUDIO_TYPES.join(', ')})` });
      }

      const audio = Buffer.isBuffer(req.body) ? req.body : null;
      if (!audio || audio.length < MIN_AUDIO_BYTES) {
        return res.status(400).json({ error: 'recording too short' });
      }

      const result = await transcribe(audio, {
        contentType,
        language: session.language,
        label: `session ${session.id.slice(0, 8)}`,
      });

      // Metered before the response, and outside any transaction: the call has
      // already been billed by the time we get here, so a failure to record it
      // must not be able to un-bill it. Best-effort for the same reason cost is
      // best-effort everywhere else — accounting must never cost a student
      // their recording.
      try {
        await pool.query(
          `INSERT INTO transcription_calls
             (session_id, org_id, model, audio_seconds,
              cost_eur, co2e_g, water_l, pricing_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            session.id,
            user.org_id ?? null,
            result.model,
            result.audio_seconds ?? 0,
            result.pricing?.cost_eur ?? null,
            result.pricing?.co2e_g ?? null,
            result.pricing?.water_l ?? null,
            result.pricing?.pricing_version ?? null,
          ]
        );
      } catch (err) {
        console.error('[sessions] transcription metering failed:', err.message);
      }

      // `low_confidence` asks the student to check their own text. It is a
      // statement about the recording, not about the speaker, and nothing is
      // stored from it.
      res.json({ text: result.text, low_confidence: result.low_confidence });
    } catch (err) {
      if (err instanceof TranscriptionError) {
        console.error('[sessions] transcription failed:', err.message);
        return res
          .status(err.timedOut ? 504 : 502)
          .json({ error: 'could not transcribe the recording' });
      }
      console.error('[sessions] transcription failed:', err);
      res.status(500).json({ error: 'could not transcribe the recording' });
    }
  }
);

/** List sessions for the current user (or all, for teachers).
 *  Includes the average overall_score across the session's answers so the
 *  teacher dashboard can show a quick performance signal without loading
 *  every session individually. */
sessionsRouter.get('/', requireAuth, withActor, async (req, res) => {
  try {
    const user = await loadCurrentUser(req);
    let rows;
    if (user.role === 'teacher') {
      // Scoped to the teacher's own organization, narrowed to their groups if
      // they have any. Before this, the query had no WHERE clause at all and
      // returned every student of every partner school.
      const scope = studentVisibilityClause(user, 'u', 1);
      const result = await pool.query(
        `SELECT s.*,
                u.display_name AS student_name,
                u.email AS student_email,
                (SELECT AVG(overall_score)::numeric(3,2)
                 FROM answer_feedback WHERE session_id = s.id) AS avg_score,
                (SELECT COUNT(*)::int
                 FROM answer_feedback WHERE session_id = s.id) AS answered_count
         FROM interview_sessions s JOIN users u ON u.id = s.student_id
         WHERE ${scope.sql}
         ORDER BY s.started_at DESC LIMIT 200`,
        scope.params
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT s.*,
                (SELECT AVG(overall_score)::numeric(3,2)
                 FROM answer_feedback WHERE session_id = s.id) AS avg_score,
                (SELECT COUNT(*)::int
                 FROM answer_feedback WHERE session_id = s.id) AS answered_count
         FROM interview_sessions s WHERE student_id = $1 AND s.language = $2
         ORDER BY started_at DESC LIMIT 200`,
        [user.id, user.preferred_language ?? 'en']
      );
      rows = result.rows;
    }
    // The catalogue draws a progress bar per unfinished interview and needs a
    // denominator. A scenario's own `question_count` wins where it sets one;
    // this is the fallback, published rather than hardcoded in the client so the
    // two cannot drift when SESSION_QUESTION_COUNT changes.
    // One row with a count, never one per student in the list — a teacher
    // opening the dashboard would otherwise write hundreds of rows and bury the
    // reads that matter. Students listing their own sessions are not an event.
    if (user.role === 'teacher' || user.role === 'admin') {
      await recordRead(user, { action: 'list_students', resultCount: rows.length });
    }

    // The student's allowance, computed here rather than in the browser. The
    // rows above are filtered to the student's own language, so counting them
    // client-side would give a number that is right only for somebody who has
    // never changed language — and the limit deliberately does not care about
    // language. `used_per_scenario` therefore covers scenarios that may not
    // appear in `sessions` at all.
    let allowance;
    if (user.role === 'student') {
      const { limits } = await effectiveLimits(user.org_id);
      const usage = await usageForStudent(user.id);

      // One date per scenario still waiting, and nothing for the rest. Sent as
      // an absolute instant rather than "in 3 days" so a page left open
      // overnight does not go on claiming yesterday's answer, and so the date
      // can be formatted in the student's own locale.
      const cooldownUntilPerScenario = {};
      for (const [scenarioId, lastStarted] of Object.entries(usage.lastStartedPerScenario)) {
        const until = cooldownUntil(limits.cooldown_days, lastStarted);
        if (until && until.getTime() > Date.now()) {
          cooldownUntilPerScenario[scenarioId] = until.toISOString();
        }
      }

      allowance = {
        attempts_per_scenario: limits.attempts_per_scenario,
        total_interviews: limits.total_interviews,
        cooldown_days: limits.cooldown_days,
        used_total: usage.total,
        remaining_total: remaining(limits.total_interviews, usage.total),
        used_per_scenario: usage.perScenario,
        cooldown_until_per_scenario: cooldownUntilPerScenario,
      };
    }

    res.json({ sessions: rows, session_length: DEFAULT_SESSION_LENGTH, allowance });
  } catch (err) {
    console.error('[sessions] list failed:', err);
    res.status(500).json({ error: 'failed to list sessions' });
  }
});
