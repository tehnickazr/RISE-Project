// What a school fills in, and what counts as unfinished.
//
// The interesting rule here is not validation but the gap count: which blanks a
// reader would actually see. Two fields that are both empty are not both a
// problem, and the interface says so differently, so the rule that separates
// them is pinned down here.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORITY_BY_COUNTRY,
  PlatformSupportSchema,
  PrivacySettingsSchema,
  SupportSettingsSchema,
  dpoLine,
  isStudentNoticeComplete,
  noticeGaps,
} from '../src/settings/school.js';

const FULL = {
  short_name: 'Tehnička škola Zrenjanin',
  legal_name: 'Tehnička škola Zrenjanin, Đorđa Stratimirovića 23',
  dpo_name: 'Milena Ristić',
  dpo_email: 'zastita@skola.example',
  dpo_phone: null,
  lawful_basis_students: 'public_task',
  lawful_basis_staff: 'public_task',
  retention_answers_value: 24, retention_answers_unit: 'months',
  retention_account_value: 12, retention_account_unit: 'months',
  retention_staff_value: 3, retention_staff_unit: 'years',
  supervisory_authority: 'Poverenik',
};

// ---------------------------------------------------------------------------
// What counts as a gap
// ---------------------------------------------------------------------------

test('a school that has filled everything in has no gaps', () => {
  assert.deepEqual(noticeGaps(FULL), []);
  assert.equal(isStudentNoticeComplete(FULL), true);
});

// The rule the whole page rests on, and the one a later edit is most likely to
// break: a telephone left blank is not an unfinished notice. Article 13 asks
// for a way to reach the officer, and an email address is one.
test('an absent telephone is never a gap', () => {
  assert.deepEqual(noticeGaps({ ...FULL, dpo_phone: null }), []);
  assert.deepEqual(noticeGaps({ ...FULL, dpo_phone: '' }), []);
});

test('an absent email is a gap, in both notices', () => {
  const gaps = noticeGaps({ ...FULL, dpo_email: null });
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], { field: 'dpo_email', audience: 'both' });
});

// Half a period renders no sentence, so half a period is a gap. Storing 24 with
// no unit would otherwise produce "we keep your answers for 24".
test('half a retention period counts as unset', () => {
  const noUnit = noticeGaps({ ...FULL, retention_answers_unit: null });
  assert.deepEqual(noUnit.map((g) => g.field), ['retention_answers']);
  const noValue = noticeGaps({ ...FULL, retention_answers_value: null });
  assert.deepEqual(noValue.map((g) => g.field), ['retention_answers']);
});

// A staff-only gap is real but must not be reported as though a student were
// reading a placeholder — the page says "nothing a student reads is missing".
test('a staff-only gap leaves the student notice complete', () => {
  const s = { ...FULL, retention_staff_value: null, retention_staff_unit: null };
  assert.deepEqual(noticeGaps(s).map((g) => g.audience), ['staff']);
  assert.equal(isStudentNoticeComplete(s), true);
});

test('an empty school has a gap for every field but the telephone', () => {
  const gaps = noticeGaps({});
  assert.equal(gaps.length, 10);
  assert.equal(gaps.some((g) => g.field === 'dpo_phone'), false);
  assert.equal(isStudentNoticeComplete({}), false);
});

// ---------------------------------------------------------------------------
// The assembled officer line
// ---------------------------------------------------------------------------

test('the officer line closes after the email when there is no telephone', () => {
  assert.equal(dpoLine(FULL), 'Milena Ristić, zastita@skola.example');
});

test('a telephone is appended when there is one', () => {
  assert.equal(
    dpoLine({ ...FULL, dpo_phone: '+381 23 000 000' }),
    'Milena Ristić, zastita@skola.example, +381 23 000 000'
  );
});

test('nothing at all is null rather than an empty string', () => {
  // An empty string would render as a blank sentence fragment in the notice;
  // null leaves the placeholder visible, which is the honest rendering.
  assert.equal(dpoLine({}), null);
});

// ---------------------------------------------------------------------------
// What the forms may send
// ---------------------------------------------------------------------------

test('every privacy field may be null, because a half-filled page must save', () => {
  const allNull = Object.fromEntries(
    Object.keys(FULL).map((k) => [k, null])
  );
  assert.equal(PrivacySettingsSchema.safeParse(allNull).success, true);
});

test('a malformed address is refused, an absent one is not', () => {
  const base = Object.fromEntries(Object.keys(FULL).map((k) => [k, null]));
  assert.equal(PrivacySettingsSchema.safeParse({ ...base, dpo_email: 'nope' }).success, false);
  assert.equal(PrivacySettingsSchema.safeParse({ ...base, dpo_email: null }).success, true);
  // An empty box is the same as an absent one — a form sends '' where a caller
  // sends null, and the difference must not reach the database.
  const blank = PrivacySettingsSchema.safeParse({ ...base, dpo_email: '' });
  assert.equal(blank.success, true);
  assert.equal(blank.data.dpo_email, null);
});

test('a lawful basis outside the list is refused', () => {
  const base = Object.fromEntries(Object.keys(FULL).map((k) => [k, null]));
  assert.equal(
    PrivacySettingsSchema.safeParse({ ...base, lawful_basis_students: 'vibes' }).success,
    false
  );
  // Contract is a staff basis and not a student one: a school cannot claim a
  // contract with a fifteen-year-old.
  assert.equal(
    PrivacySettingsSchema.safeParse({ ...base, lawful_basis_students: 'contract' }).success,
    false
  );
  assert.equal(
    PrivacySettingsSchema.safeParse({ ...base, lawful_basis_staff: 'contract' }).success,
    true
  );
});

test('support addresses are optional but must be addresses', () => {
  const ok = SupportSettingsSchema.safeParse({
    support_name: 'IT', support_email: null, support_phone: null, support_hours: null,
  });
  assert.equal(ok.success, true);
  assert.equal(
    SupportSettingsSchema.safeParse({
      support_name: null, support_email: 'broken', support_phone: null, support_hours: null,
    }).success,
    false
  );
  assert.equal(
    PlatformSupportSchema.safeParse({ support_name: null, support_email: null }).success,
    true
  );
});

test('each partner country has a supervisory authority to suggest', () => {
  for (const country of ['RS', 'FR', 'PT']) {
    assert.equal(typeof AUTHORITY_BY_COUNTRY[country], 'string');
  }
});
