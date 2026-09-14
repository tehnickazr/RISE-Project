// Who a teacher may see, as a SQL fragment.
//
// Pure, and in its own module with no database import, for the reason
// sampler.js and criteria.js already document: anything that reaches the pool
// refuses to load without DATABASE_URL, and this is the one piece of logic in
// the codebase whose failure mode is showing one school's students to another.
// It should be the easiest thing here to test, not the hardest.

/**
 * The clause limiting a teacher to the students they may see, plus its
 * parameters.
 *
 * **Additive scoping, deliberately.** A teacher with no group assignment sees
 * their whole organization; a teacher assigned to groups sees only those
 * groups. The other way round — mandatory group membership — means one missed
 * assignment shows a teacher an empty dashboard with a class in front of them,
 * and no way to fix it themselves.
 *
 * The organization term is ANDed, never ORed. A group is always inside one
 * organization, but relying on that to keep schools apart would make the
 * isolation depend on the group data being right rather than on the predicate.
 *
 * `alias` is the table alias for the *student's* users row in the caller's
 * query, so this drops into differently shaped statements.
 */
export function studentVisibilityClause(teacher, alias = 'u', firstParam = 1) {
  const orgParam = firstParam;
  const teacherParam = firstParam + 1;

  const sql = `${alias}.org_id = $${orgParam}
    AND (
      NOT EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.user_id = $${teacherParam})
      OR EXISTS (
        SELECT 1
          FROM group_students gs
          JOIN group_teachers gt ON gt.group_id = gs.group_id
         WHERE gs.user_id = ${alias}.id
           AND gt.user_id = $${teacherParam}
      )
    )`;

  return { sql, params: [teacher.org_id, teacher.id] };
}
