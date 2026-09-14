#!/usr/bin/env node
//
// Prove, against real rows, that a teacher at one school cannot reach a student
// at another.
//
//   node --env-file-if-exists=.env scripts/check-tenant-isolation.mjs
//
// A script rather than a unit test because it needs a database. The unit suite
// checks the shape of the predicate; this checks what the predicate does. Both
// matter, and this is the one that would have caught the defect it exists for.
//
// Read-only apart from a temporary fixture organization, which is removed on
// the way out even if an assertion fails.

import pg from 'pg';
import { studentVisibilityClause } from '../src/auth/visibility.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const failures = [];
const ok = (label) => console.log(`  ok    ${label}`);
const bad = (label, detail) => {
  failures.push(label);
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};

async function visibleStudents(teacher) {
  const { sql, params } = studentVisibilityClause(teacher, 'u', 1);
  const { rows } = await c.query(
    `SELECT u.id, u.email FROM users u WHERE u.role = 'student' AND ${sql}`,
    params
  );
  return rows;
}

try {
  await c.query('BEGIN');

  // Two throwaway organizations, so the check does not depend on which real
  // schools happen to exist or who is in them.
  const { rows: orgs } = await c.query(
    `INSERT INTO organizations (slug, name, country, default_language) VALUES
       ('zzz-isolation-a', 'Isolation Check A', 'XX', 'en'),
       ('zzz-isolation-b', 'Isolation Check B', 'XX', 'en')
     RETURNING id, slug`
  );
  const A = orgs.find((o) => o.slug === 'zzz-isolation-a').id;
  const B = orgs.find((o) => o.slug === 'zzz-isolation-b').id;

  const mk = async (org, role, email) => {
    const { rows } = await c.query(
      `INSERT INTO users (email, password_hash, display_name, role, preferred_language, org_id)
       VALUES ($1, 'x', $1, $2, 'en', $3) RETURNING id, org_id`,
      [email, role, org]
    );
    return rows[0];
  };

  const teacherA = await mk(A, 'teacher', 'zzz.teacher.a@isolation.test');
  const teacherA2 = await mk(A, 'teacher', 'zzz.teacher.a2@isolation.test');
  const studentA1 = await mk(A, 'student', 'zzz.student.a1@isolation.test');
  const studentA2 = await mk(A, 'student', 'zzz.student.a2@isolation.test');
  const studentB1 = await mk(B, 'student', 'zzz.student.b1@isolation.test');

  // --- 1. the defect this whole change exists to close ---------------------
  let seen = await visibleStudents(teacherA);
  const ids = seen.map((r) => r.id);
  if (ids.includes(studentB1.id)) bad('a teacher cannot see another school\'s student');
  else ok('a teacher cannot see another school\'s student');

  if (ids.includes(studentA1.id) && ids.includes(studentA2.id)) {
    ok('an unassigned teacher sees every student in their own school');
  } else {
    bad('an unassigned teacher sees every student in their own school', `saw ${ids.length}`);
  }

  // --- 2. groups narrow, and only within the organization ------------------
  const { rows: g } = await c.query(
    `INSERT INTO groups (org_id, name) VALUES ($1, 'Isolation Group') RETURNING id`,
    [A]
  );
  await c.query('INSERT INTO group_teachers (group_id, user_id) VALUES ($1, $2)', [g[0].id, teacherA.id]);
  await c.query('INSERT INTO group_students (group_id, user_id) VALUES ($1, $2)', [g[0].id, studentA1.id]);

  seen = await visibleStudents(teacherA);
  const grouped = seen.map((r) => r.id);
  if (grouped.includes(studentA1.id) && !grouped.includes(studentA2.id)) {
    ok('an assigned teacher sees only their group');
  } else {
    bad('an assigned teacher sees only their group', `saw ${grouped.length}`);
  }
  if (!grouped.includes(studentB1.id)) ok('groups do not widen across schools');
  else bad('groups do not widen across schools');

  // A second teacher in the same school, still unassigned, must be unaffected
  // by someone else's group.
  seen = await visibleStudents(teacherA2);
  const other = seen.map((r) => r.id);
  if (other.includes(studentA1.id) && other.includes(studentA2.id)) {
    ok('one teacher\'s group does not narrow another teacher');
  } else {
    bad('one teacher\'s group does not narrow another teacher', `saw ${other.length}`);
  }

  // --- 3. a group id from another school grants nothing --------------------
  await c.query('INSERT INTO group_students (group_id, user_id) VALUES ($1, $2)', [g[0].id, studentB1.id]);
  seen = await visibleStudents(teacherA);
  if (!seen.map((r) => r.id).includes(studentB1.id)) {
    ok('sharing a group with another school\'s student still grants nothing');
  } else {
    bad('sharing a group with another school\'s student still grants nothing');
  }

  // --- 4. every account belongs somewhere ----------------------------------
  const { rows: orphans } = await c.query(
    `SELECT count(*)::int AS n FROM users WHERE role <> 'super_admin' AND org_id IS NULL`
  );
  if (orphans[0].n === 0) ok('no account outside an organisation');
  else bad('no account outside an organisation', `${orphans[0].n} found`);

  const { rows: stray } = await c.query(
    `SELECT count(*)::int AS n FROM users WHERE role = 'super_admin' AND org_id IS NOT NULL`
  );
  if (stray[0].n === 0) ok('no super administrator inside an organisation');
  else bad('no super administrator inside an organisation', `${stray[0].n} found`);
} finally {
  // Never leave fixtures behind, whatever happened above.
  await c.query('ROLLBACK');
  await c.end();
}

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} isolation check(s) FAILED`);
  process.exit(1);
}
console.log('all isolation checks passed');
