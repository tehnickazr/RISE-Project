// Which spreadsheet an organization's content comes from.

import { pool } from './pool.js';

const TTL_MS = 60 * 1000;
const _cache = new Map(); // orgId -> { sheetId, expiresAt }

/**
 * The organization's spreadsheet id, or null if it has none yet.
 *
 * Cached briefly and separately from the content itself: the sheet *contents*
 * are cached for five minutes because they are large, but which sheet an
 * organization reads is one short string that an administrator can change and
 * expects to see take effect. A minute is short enough to feel immediate and
 * long enough that a class starting together does not make one lookup each.
 *
 * Returns null rather than falling back to a shared sheet. A school with no
 * content configured should serve nothing and say so — quietly showing it
 * another school's catalogue is how this went wrong in the first place.
 */
export async function sheetIdForOrg(orgId) {
  if (!orgId) return null;

  const hit = _cache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.sheetId;

  const { rows } = await pool.query(
    'SELECT spreadsheet_id FROM org_content_source WHERE org_id = $1',
    [orgId]
  );
  const sheetId = rows[0]?.spreadsheet_id ?? null;
  _cache.set(orgId, { sheetId, expiresAt: Date.now() + TTL_MS });
  return sheetId;
}

/** Drop the memo for one organization, after an administrator changes it. */
export function forgetContentSource(orgId) {
  if (orgId) _cache.delete(orgId);
  else _cache.clear();
}
