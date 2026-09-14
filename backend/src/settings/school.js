// What a school fills in, and what counts as unfinished.
//
// Pure: no database, no request. The interesting logic here is not validation
// but the *gap count* — which fields, left blank, put a visible `<placeholder>`
// in front of a student, and which are simply absent. Those are different
// things and the interface says so differently, so the rule that separates them
// is written once, here, and tested.

import { z } from 'zod';

export const PERIOD_UNITS = ['days', 'months', 'years'];
export const STUDENT_BASES = ['public_task', 'legal_obligation', 'consent'];
export const STAFF_BASES = ['public_task', 'contract'];

/**
 * A supervisory authority per country, prefilled on first read.
 *
 * The Serbian, French and Portuguese notices already name theirs in their own
 * text; only the English one carries a blank. Prefilled rather than hardcoded
 * because a school may be under a regional authority, and because a school that
 * moves country should be able to correct it without a deploy.
 */
export const AUTHORITY_BY_COUNTRY = {
  RS: 'Poverenik za informacije od javnog značaja i zaštitu podataka o ličnosti — poverenik.rs',
  FR: 'Commission nationale de l’informatique et des libertés (CNIL) — www.cnil.fr',
  PT: 'Comissão Nacional de Proteção de Dados (CNPD) — www.cnpd.pt',
};

const trimmed = (max) =>
  z.string().trim().max(max).nullable().transform((v) => (v === '' ? null : v));

const period = z.number().int().min(1).max(999).nullable();
const unit = z.enum(PERIOD_UNITS).nullable();

/**
 * The privacy notice page.
 *
 * Every field is nullable. A half-filled notice is the state this page exists
 * to fix, so refusing to save one would leave an administrator unable to record
 * the three things they do know because they are still chasing the fourth.
 */
export const PrivacySettingsSchema = z.object({
  short_name: trimmed(120),
  legal_name: trimmed(600),
  dpo_name: trimmed(160),
  // Not z.string().email(): an empty DPO address is the normal starting state
  // and must save. The address is checked only when there is one.
  dpo_email: trimmed(200).refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: 'Enter a valid email address for the data protection officer',
  }),
  dpo_phone: trimmed(60),
  lawful_basis_students: z.enum(STUDENT_BASES).nullable(),
  lawful_basis_staff: z.enum(STAFF_BASES).nullable(),
  retention_answers_value: period,
  retention_answers_unit: unit,
  retention_account_value: period,
  retention_account_unit: unit,
  retention_staff_value: period,
  retention_staff_unit: unit,
  supervisory_authority: trimmed(300),
});

/** The help and contacts page. Only the address carries any requirement. */
export const SupportSettingsSchema = z.object({
  support_name: trimmed(120),
  support_email: trimmed(200).refine(
    (v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    { message: 'Enter a valid email address, or leave it blank' }
  ),
  support_phone: trimmed(60),
  support_hours: trimmed(160),
});

/** The platform's own contact. Set by a super administrator. */
export const PlatformSupportSchema = z.object({
  support_name: trimmed(120),
  support_email: trimmed(200).refine(
    (v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    { message: 'Enter a valid email address, or leave it blank' }
  ),
});

/**
 * Which blanks a reader would actually see.
 *
 * This is the whole distinction the interface rests on. A field is counted only
 * if leaving it blank puts a visible gap in a notice somebody opens — so the
 * data protection officer's *telephone* is not counted (the sentence closes
 * after the email address), and neither is anything on the support page (an
 * absent contact renders as one fewer entry, not as `<email>`).
 *
 * Returns one entry per gap: the field, and whose notice it spoils. The caller
 * shows the count; the page shows which.
 */
export function noticeGaps(s = {}) {
  const gaps = [];
  const add = (field, audience) => gaps.push({ field, audience });

  if (!s.short_name) add('short_name', 'student');
  if (!s.legal_name) add('legal_name', 'both');
  if (!s.dpo_name) add('dpo_name', 'both');
  if (!s.dpo_email) add('dpo_email', 'both');
  // dpo_phone is deliberately absent from this list.
  if (!s.lawful_basis_students) add('lawful_basis_students', 'student');
  if (!s.lawful_basis_staff) add('lawful_basis_staff', 'staff');
  if (!s.retention_answers_value || !s.retention_answers_unit) {
    add('retention_answers', 'student');
  }
  if (!s.retention_account_value || !s.retention_account_unit) {
    add('retention_account', 'student');
  }
  if (!s.retention_staff_value || !s.retention_staff_unit) add('retention_staff', 'staff');
  if (!s.supervisory_authority) add('supervisory_authority', 'both');

  return gaps;
}

/**
 * The controller and officer, assembled.
 *
 * Names, addresses and phone numbers read the same in every language, so this
 * runs once rather than per notice. The telephone is appended only when it
 * exists — an optional field left blank has to leave no trace, not a trailing
 * comma before a full stop.
 */
export function dpoLine(s = {}) {
  const parts = [s.dpo_name, s.dpo_email, s.dpo_phone].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Is there enough here for a notice that names no placeholders to a student? */
export function isStudentNoticeComplete(s) {
  return noticeGaps(s).every((g) => g.audience === 'staff');
}
