// Who may see whose records.
//
// One module, because the characteristic failure of a shared-schema
// multi-tenant system is a single query that forgot its predicate — and here
// the data that leaks is interview transcripts written by minors. Predicates
// written inline in eight route handlers are eight chances to forget. These are
// written once and imported.
//
// Application-level enforcement, for now. Row-level security is the intended
// backstop and it is not here yet; see migration 0015 for why the two changes
// are separate.

import { pool } from './pool.js';
import { studentVisibilityClause } from '../auth/visibility.js';

export { studentVisibilityClause };

/**
 * Can this teacher see this student? The single-row form of the clause above.
 *
 * Returns false for a student in another organization, for a student outside
 * the teacher's groups when the teacher has any, and for a subject who is not
 * a student at all.
 */
export async function teacherMaySeeStudent(teacher, studentId) {
  const { sql, params } = studentVisibilityClause(teacher, 'u', 2);
  const { rows } = await pool.query(
    `SELECT 1 FROM users u WHERE u.id = $1 AND u.role = 'student' AND ${sql}`,
    [studentId, ...params]
  );
  return rows.length > 0;
}

/**
 * The organization a request is acting within, loaded fresh rather than trusted
 * from the session.
 *
 * `org_id` is written into the session at login, but it is re-read here on
 * every request that matters: a suspended organization must stop working
 * immediately, and a person moved between schools must not keep the old one
 * until their cookie expires. It is never taken from a URL, a header or a body
 * — a client-supplied organization identifier is the classic tenancy bypass.
 */
export async function loadActor(req) {
  if (!req.session?.userId) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.role, u.preferred_language, u.org_id, u.status,
            o.slug AS org_slug, o.name AS org_name, o.status AS org_status,
            o.default_language AS org_default_language
       FROM users u
       LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.id = $1`,
    [req.session.userId]
  );
  return rows[0] ?? null;
}

export function isSuperAdmin(actor) {
  return actor?.role === 'super_admin';
}
