// Access records for student personal data.
//
// One helper, called explicitly from each route that returns a student's data
// to somebody who is not that student. Explicit rather than middleware on
// purpose: middleware fires on 403s and 404s as though they were reads, and it
// cannot name the subject without re-deriving what the route already knows.
// Three call sites is a small enough surface to keep honest, and `recordRead`
// greps cleanly.
//
// What never goes in here: answer text, feedback prose, scores. The log records
// that a read happened, not what was read. See migrations/0010_audit_log.sql.

import { pool } from './pool.js';

/**
 * Record that someone read a student's data.
 *
 * Never throws. By the time this runs the data has already been assembled and
 * the read has effectively happened, so failing the request would cost a
 * teacher their page without un-reading anything. The insert failure is logged
 * loudly instead — every LLM call already logs a line, so stderr is watched.
 *
 * Labels are captured here rather than joined on read. The log has to outlive
 * the rows it describes — an erasure record that names nobody is worth nothing —
 * and that is why `audit_log` no longer carries foreign keys to `users`. See
 * migrations/0012.
 *
 * @param {object} actor        the authenticated user, with `id`, `role`, `email`
 * @param {object} entry
 * @param {'read_transcript'|'read_profile'|'list_students'|'export'|'erase'} entry.action
 * @param {string} [entry.subjectId]    the person whose data was reached
 * @param {string} [entry.subjectLabel] who they were at the time; required for
 *                                      `erase`, where they no longer exist
 * @param {string} [entry.objectId]     the session, where the action names one
 * @param {number} [entry.resultCount]  for lists: how many people were exposed
 */
export async function recordRead(
  actor,
  { action, subjectId, subjectLabel, objectId, resultCount } = {}
) {
  if (!actor?.id || !action) return;

  // A student opening their own interview is not an access event — it is the
  // person the record is about, reading it. Logging it would bury the reads
  // that matter under the ones that do not.
  if (subjectId && subjectId === actor.id) return;

  try {
    await pool.query(
      `INSERT INTO audit_log
         (actor_id, actor_role, actor_label, action, subject_id, subject_label,
          object_id, result_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actor.id,
        actor.role,
        actor.email ?? null,
        action,
        subjectId ?? null,
        subjectLabel ?? null,
        objectId ?? null,
        resultCount ?? null,
      ]
    );
  } catch (err) {
    console.error(`[audit] FAILED to record ${action} by ${actor.id}:`, err.message ?? err);
  }
}
