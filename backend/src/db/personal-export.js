import { pool } from './pool.js';

/**
 * Everything the platform holds about one person, as JSON.
 *
 * Article 15 access — a copy — rather than Article 20 portability, which
 * applies to consent and contract and not to a public task. So this is "your
 * data", not a machine-readable hand-off to another service; JSON either way.
 *
 * One builder, two callers: the person themselves, and an administrator acting
 * on a request. They must return the same thing. Two copies of these five
 * queries would drift, and the direction they would drift in is a person being
 * told less about themselves than a third party can see about them.
 */
export async function buildPersonalExport(userId) {
  const { rows: userRows } = await pool.query(
    `SELECT id, email, display_name, role, preferred_language, created_at,
            notice_version, notice_language, notice_ack_at
       FROM users WHERE id = $1`,
    [userId]
  );
  const user = userRows[0];
  if (!user) return null;

  const { rows: sessions } = await pool.query(
    `SELECT id, scenario_id, language, status, attempt_number, started_at, completed_at
       FROM interview_sessions WHERE student_id = $1 ORDER BY started_at`,
    [user.id]
  );
  const { rows: answers } = await pool.query(
    `SELECT f.session_id, f.question_id, f.student_answer, f.ai_feedback_json,
            f.overall_score, f.answer_char_count, f.created_at
       FROM answer_feedback f
       JOIN interview_sessions s ON s.id = f.session_id
      WHERE s.student_id = $1 ORDER BY f.created_at`,
    [user.id]
  );
  const { rows: summaries } = await pool.query(
    `SELECT m.session_id, m.content, m.created_at
       FROM interview_messages m
       JOIN interview_sessions s ON s.id = m.session_id
      WHERE s.student_id = $1 AND m.message_type = 'summary' ORDER BY m.created_at`,
    [user.id]
  );
  const { rows: requests } = await pool.query(
    `SELECT kind, requested_at, due_at, status, handled_at FROM data_requests
      WHERE user_id = $1 ORDER BY requested_at`,
    [user.id]
  );

  return {
    user,
    payload: {
      exported_at: new Date().toISOString(),
      about: 'Everything the RISE platform holds about this person.',
      account: user,
      sessions,
      answers,
      summaries,
      data_requests: requests,
      note: 'Records of who accessed this data are held separately and retained for 12 months.',
    },
  };
}

/** `attachment`, so a browser saves the file rather than rendering JSON. */
export function sendExport(res, userId, payload) {
  res.setHeader('Content-Disposition', `attachment; filename="rise-data-${userId}.json"`);
  res.json(payload);
}
