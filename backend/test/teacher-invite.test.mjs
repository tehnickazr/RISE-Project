import test from 'node:test';
import assert from 'node:assert/strict';
import { TeacherInviteSchema } from '../src/invitations/schema.js';

/**
 * A teacher may invite students, and only students.
 *
 * The interface shows the role greyed out, which is a courtesy and not a
 * control: the request is an ordinary POST and anyone can send a different one.
 * What actually holds the line is that the schema has no `role` field, so a
 * body carrying one arrives at the handler without it and the literal
 * `'student'` is what reaches the insert.
 *
 * This is worth a test because the failure would be silent and serious. If a
 * `role` field ever appeared here — added in good faith, to "validate" it —
 * then a teacher could mint an administrator of their own school, and nothing
 * in the interface would look any different.
 */

test('a role in the request body does not survive the schema', () => {
  const parsed = TeacherInviteSchema.parse({
    email: 'novi.ucenik@example.org',
    display_name: 'Novi Učenik',
    role: 'admin',
  });
  assert.equal(parsed.role, undefined);
  assert.ok(!('role' in parsed));
});

test('an org_id in the request body does not survive either', () => {
  // Same reasoning as the role, one level up: the organization is read from
  // the inviter. A client-supplied one would place an account inside somebody
  // else's school.
  const parsed = TeacherInviteSchema.parse({
    email: 'a@example.org',
    display_name: 'A',
    org_id: '00000000-0000-0000-0000-000000000000',
  });
  assert.ok(!('org_id' in parsed));
});

test('the language is optional, so the school default can apply', () => {
  const parsed = TeacherInviteSchema.parse({ email: 'a@example.org', display_name: 'A' });
  assert.equal(parsed.preferred_language, undefined);
});

test('a name and a usable address are both required', () => {
  assert.equal(TeacherInviteSchema.safeParse({ email: 'not-an-address', display_name: 'A' }).success, false);
  assert.equal(TeacherInviteSchema.safeParse({ email: 'a@example.org', display_name: '  ' }).success, false);
});
