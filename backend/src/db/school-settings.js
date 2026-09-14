// Reading and writing org_settings. The rules live in ../settings/school.js,
// which touches nothing.

import { pool } from './pool.js';
import { AUTHORITY_BY_COUNTRY, noticeGaps } from '../settings/school.js';

const COLUMNS = `
  short_name, legal_name,
  dpo_name, dpo_email, dpo_phone,
  lawful_basis_students, lawful_basis_staff,
  retention_answers_value, retention_answers_unit,
  retention_account_value, retention_account_unit,
  retention_staff_value, retention_staff_unit,
  supervisory_authority,
  support_name, support_email, support_phone, support_hours,
  updated_at, updated_by`;

const EMPTY = {
  short_name: null, legal_name: null,
  dpo_name: null, dpo_email: null, dpo_phone: null,
  lawful_basis_students: null, lawful_basis_staff: null,
  retention_answers_value: null, retention_answers_unit: null,
  retention_account_value: null, retention_account_unit: null,
  retention_staff_value: null, retention_staff_unit: null,
  supervisory_authority: null,
  support_name: null, support_email: null, support_phone: null, support_hours: null,
  updated_at: null, updated_by: null,
};

/**
 * One school's settings, with the row created lazily.
 *
 * A row is not inserted when an organization is created: nothing reads it until
 * an administrator opens the page, and a table of empty rows created by a
 * migration is a table nobody can tell apart from one somebody filled in and
 * then cleared. Absent means untouched.
 *
 * The supervisory authority is prefilled from the school's country on the way
 * out rather than on the way in. Writing it into the row at creation would
 * freeze today's guess as though a human had chosen it; suggesting it on read
 * keeps the distinction between "we filled this in for you" and "you agreed".
 */
export async function schoolSettings(orgId) {
  const { rows } = await pool.query(
    `SELECT o.country, s.*
       FROM organizations o
       LEFT JOIN org_settings s ON s.org_id = o.id
      WHERE o.id = $1`,
    [orgId]
  );
  const row = rows[0];
  if (!row) return null;

  const settings = { ...EMPTY };
  for (const key of Object.keys(EMPTY)) {
    if (row[key] !== undefined && row[key] !== null) settings[key] = row[key];
  }

  const suggestedAuthority = AUTHORITY_BY_COUNTRY[row.country] ?? null;
  return {
    settings,
    country: row.country ?? null,
    suggested_authority: suggestedAuthority,
    gaps: noticeGaps(settings),
  };
}

/**
 * Write one page's worth of fields.
 *
 * Takes only the keys the caller's schema produced, so the privacy page cannot
 * clear a support address it never showed and the support page cannot clear a
 * retention period. Two pages writing one row is exactly how a field gets
 * blanked by a form that did not know it existed.
 */
export async function saveSchoolSettings(orgId, patch, userId) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return schoolSettings(orgId);

  const insertCols = ['org_id', ...keys, 'updated_by'];
  const values = [orgId, ...keys.map((k) => patch[k]), userId ?? null];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const updates = [
    ...keys.map((k, i) => `${k} = $${i + 2}`),
    `updated_by = $${values.length}`,
    'updated_at = now()',
  ].join(', ');

  await pool.query(
    `INSERT INTO org_settings (${insertCols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (org_id) DO UPDATE SET ${updates}`,
    values
  );
  return schoolSettings(orgId);
}

/**
 * What a student or teacher needs at the moment something goes wrong: their
 * school's contact, and the platform's.
 *
 * Deliberately not the data protection officer. A student with a login problem
 * writing to the officer is a nuisance; a student with an erasure request
 * writing to an IT helpdesk starts a one-month statutory clock in an inbox with
 * no authority to answer it. The officer stays in the privacy notice, which is
 * linked from the help sheet rather than copied into it.
 */
export async function supportContacts(orgId) {
  const { rows: platformRows } = await pool.query(
    'SELECT support_name, support_email FROM platform_settings WHERE id = true'
  );
  const platform = platformRows[0] ?? { support_name: null, support_email: null };

  let school = { support_name: null, support_email: null, support_phone: null, support_hours: null };
  if (orgId) {
    const { rows } = await pool.query(
      `SELECT support_name, support_email, support_phone, support_hours
         FROM org_settings WHERE org_id = $1`,
      [orgId]
    );
    if (rows[0]) school = rows[0];
  }

  return {
    school: school.support_email ? school : null,
    platform: platform.support_email ? platform : null,
  };
}

export { COLUMNS as SCHOOL_SETTINGS_COLUMNS };
