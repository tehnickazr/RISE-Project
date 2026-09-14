import test from 'node:test';
import assert from 'node:assert/strict';
import { studentVisibilityClause } from '../src/auth/visibility.js';

/**
 * The clause that decides who sees whose transcript, checked as SQL text.
 *
 * These do not need a database: what can go wrong here is the shape of the
 * predicate — a missing organization term, or group logic that subtracts
 * instead of adds — and that is visible in the SQL. The behaviour against real
 * rows is checked separately by the isolation script, which needs a database
 * and does not belong in the unit suite.
 */

const teacher = { id: 'teacher-1', org_id: 'org-1' };

test('the organization is always constrained, whatever else happens', () => {
  const { sql, params } = studentVisibilityClause(teacher, 'u', 1);
  assert.match(sql, /u\.org_id = \$1/);
  assert.equal(params[0], 'org-1');
});

test('placeholders follow the offset they were given', () => {
  const { sql, params } = studentVisibilityClause(teacher, 'u', 5);
  assert.match(sql, /u\.org_id = \$5/);
  assert.match(sql, /\$6/);
  assert.equal(params.length, 2);
  assert.deepEqual(params, ['org-1', 'teacher-1']);
});

test('the alias is honoured, so the clause drops into different queries', () => {
  const { sql } = studentVisibilityClause(teacher, 'stu', 1);
  assert.match(sql, /stu\.org_id = \$1/);
  assert.match(sql, /gs\.user_id = stu\.id/);
  assert.doesNotMatch(sql, /\bu\.org_id/);
});

test('group scoping is additive: no assignment means the whole organization', () => {
  // The NOT EXISTS branch is what makes an unassigned teacher see everyone in
  // their school rather than nobody. Losing it would empty every dashboard the
  // day groups ship, and the teacher could not fix it themselves.
  const { sql } = studentVisibilityClause(teacher, 'u', 1);
  assert.match(sql, /NOT EXISTS[\s\S]*group_teachers/);
  assert.match(sql, /\bOR\b/);
});

test('an assigned teacher is limited to students sharing one of their groups', () => {
  const { sql } = studentVisibilityClause(teacher, 'u', 1);
  assert.match(sql, /group_students gs/);
  assert.match(sql, /JOIN group_teachers gt ON gt\.group_id = gs\.group_id/);
  assert.match(sql, /gt\.user_id = \$2/);
});

test('the two conditions are joined by AND, so groups never widen the scope', () => {
  // A group in another organization must not grant access. Were these ORed,
  // sharing a group id across schools would.
  const { sql } = studentVisibilityClause(teacher, 'u', 1);
  const orgFirst = sql.indexOf('org_id');
  const andIndex = sql.indexOf('AND');
  assert.ok(orgFirst >= 0 && andIndex > orgFirst, 'organization term must come first and be ANDed');
});
