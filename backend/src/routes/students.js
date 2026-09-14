import express from 'express';
import { requireAuth, withActor } from '../auth/middleware.js';
import { teacherMaySeeStudent } from '../db/scope.js';
import { pool } from '../db/pool.js';
import { recordRead } from '../db/audit.js';
import { loadScenarioForVersion, versionForSession } from '../content/store.js';

export const studentsRouter = express.Router();

/**
 * Teachers only, and only their own students.
 *
 * Administrators are excluded on purpose, at both levels: a school
 * administrator manages accounts and answers erasure requests, a platform
 * administrator manages organizations, and neither reads a transcript. Students
 * reach their own history through /api/sessions.
 */
async function requireTeacher(req, res) {
  const user = req.actor;
  if (!user || user.role !== 'teacher') {
    res.status(403).json({ error: 'teachers only' });
    return null;
  }
  return user;
}

/**
 * Everything the per-student progress view needs, in one request.
 *
 * The alternative — list the student's sessions and then fetch each one — is
 * N+1 calls for a page that is mostly aggregate.
 *
 * Per-criterion scores come from `answer_criterion_scores` and are averaged by
 * the database. They used to be unpacked from `ai_feedback_json` here, which
 * meant selecting the model's whole reply — every strength, improvement and
 * rewritten answer — to arrive at five numbers, and would have stopped working
 * the moment that prose is encrypted. See migration 0014.
 */
studentsRouter.get('/:id/progress', requireAuth, withActor, async (req, res) => {
  try {
    const teacher = await requireTeacher(req, res);
    if (!teacher) return;

    // Scope first, and answer 404 either way. Distinguishing "no such student"
    // from "not your student" tells a teacher at one school whether an account
    // exists at another, which is itself a small leak across the boundary this
    // check exists to draw.
    if (!(await teacherMaySeeStudent(teacher, req.params.id))) {
      return res.status(404).json({ error: 'student not found' });
    }

    const { rows: studentRows } = await pool.query(
      `SELECT id, display_name, email, preferred_language, created_at
       FROM users WHERE id = $1 AND role = 'student'`,
      [req.params.id]
    );
    const student = studentRows[0];
    if (!student) return res.status(404).json({ error: 'student not found' });

    const { rows: sessions } = await pool.query(
      `SELECT s.id, s.scenario_id, s.language, s.status, s.attempt_number,
              s.started_at, s.completed_at, s.content_version_id,
              (SELECT AVG(overall_score)::numeric(3,2)
               FROM answer_feedback WHERE session_id = s.id) AS avg_score,
              (SELECT COUNT(*)::int
               FROM answer_feedback WHERE session_id = s.id) AS answered_count
       FROM interview_sessions s
       WHERE s.student_id = $1
       ORDER BY s.started_at DESC`,
      [student.id]
    );

    // One row per answered question. Deliberately no `ai_feedback_json`: this
    // view needs numbers, and selecting the blob pulled every strength,
    // improvement and rewritten answer across the wire to reach five of them.
    const { rows: feedback } = await pool.query(
      `SELECT f.session_id, f.question_id, f.overall_score, f.created_at
       FROM answer_feedback f
       JOIN interview_sessions s ON s.id = f.session_id
       WHERE s.student_id = $1
       ORDER BY f.created_at ASC`,
      [student.id]
    );

    // Per-competency averages, aggregated by the database rather than unpacked
    // from JSON in JavaScript. Reads `answer_criterion_scores` (migration
    // 0014), which is what keeps this working once the prose is encrypted.
    const { rows: criterionRows } = await pool.query(
      `SELECT f.session_id,
              a.competency,
              round(avg(a.score), 2)::float8 AS score
       FROM answer_criterion_scores a
       JOIN answer_feedback f ON f.id = a.answer_feedback_id
       JOIN interview_sessions s ON s.id = f.session_id
       WHERE s.student_id = $1
       GROUP BY f.session_id, a.competency`,
      [student.id]
    );

    const competencies = {};
    for (const row of criterionRows) {
      (competencies[row.session_id] ??= {})[row.competency] = row.score;
    }

    const answersBySession = {};
    for (const row of feedback) {
      (answersBySession[row.session_id] ??= []).push({
        question_id: row.question_id,
        overall_score: row.overall_score == null ? null : Number(row.overall_score),
      });
    }

    // The most recent finished session is expanded on the page, so its question
    // texts and closing summary come along. Older attempts stay collapsed and
    // are loaded through /api/sessions/:id when opened.
    const latest = sessions.find((s) => s.answered_count > 0) ?? null;
    let latestDetail = null;
    if (latest) {
      // Resolved against the version that session was taken on, so a scenario
      // since removed from the spreadsheet still renders.
      const scenario = await loadScenarioForVersion(
        await versionForSession(latest, teacher.org_id),
        latest.scenario_id
      );
      const answers = answersBySession[latest.id] ?? [];
      const byId = new Map(answers.map((a) => [a.question_id, a]));
      const questions = (scenario?.questions ?? [])
        .filter((q) => byId.has(q.question_id))
        .sort((a, b) => a.order - b.order)
        .map((q) => ({
          question_id: q.question_id,
          order: q.order,
          type: q.type,
          competency: q.competency,
          question_sr: q.question_sr,
          question_en: q.question_en,
          question_fr: q.question_fr,
          question_pt: q.question_pt,
          score: byId.get(q.question_id).overall_score,
        }));
      const { rows: summaryRows } = await pool.query(
        `SELECT content FROM interview_messages
         WHERE session_id = $1 AND message_type = 'summary'
         ORDER BY created_at DESC LIMIT 1`,
        [latest.id]
      );
      let summary = null;
      try {
        summary = summaryRows[0] ? JSON.parse(summaryRows[0].content) : null;
      } catch {
        summary = null;
      }
      latestDetail = { session_id: latest.id, questions, summary };
    }

    // Scores, per-criterion breakdown, and the AI's written summary about the
    // student. Not their raw answers — those come through /api/sessions/:id,
    // which logs `read_transcript` — but enough to be an access event.
    await recordRead(teacher, {
      action: 'read_profile',
      subjectId: student.id,
      subjectLabel: student.email,
    });

    res.json({
      student: {
        id: student.id,
        display_name: student.display_name,
        email: student.email,
        preferred_language: student.preferred_language,
        created_at: student.created_at,
      },
      sessions,
      competencies,
      latest: latestDetail,
    });
  } catch (err) {
    console.error('[students] progress failed:', err);
    res.status(500).json({ error: 'failed to load student progress' });
  }
});
