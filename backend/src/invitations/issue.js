import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { appOrigin, inviteExpiryHours, sendInviteEmail } from '../email/mailer.js';

/**
 * Issue an invitation: one token, one row, one email.
 *
 * This exists because there are now three places that invite somebody — a
 * school administrator, a teacher, and the platform — and the part they share
 * is the part that must not drift: the organization comes from the *inviter*,
 * never from the request body, and a row whose email failed to send is removed
 * rather than left behind as a token nobody received.
 *
 * What each caller keeps for itself is who it is allowed to invite. That is the
 * authorisation question, it differs at every level, and it is deliberately not
 * a parameter with a default here — a helper that could be talked into a role
 * by its arguments is the wrong shape for the one decision that matters.
 */
export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @returns `{ invitation }` on success, or `{ status, error }` with a sentence
 *   the caller can hand straight back. Never throws for an expected outcome.
 */
export async function issueInvitation({
  req,
  email,
  displayName,
  role,
  language,
  orgId,
  orgName,
  invitedBy,
}) {
  const address = String(email).toLowerCase();

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [address]);
  if (existing.rows.length > 0) {
    return { status: 409, error: 'A user with this email already exists' };
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + inviteExpiryHours() * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO user_invitations
       (email, display_name, role, preferred_language, token_hash, expires_at, invited_by, org_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, email, display_name, role, preferred_language, expires_at, accepted_at, created_at`,
    [address, displayName, role, language, tokenHash(token), expiresAt, req.session.userId, orgId ?? null]
  );

  try {
    await sendInviteEmail({
      to: address,
      displayName,
      // The inviter's own name, not "a RISE administrator". This mail asks a
      // minor to click a link and choose a password, and the name of a teacher
      // they know is the strongest signal available that it is genuine —
      // whereas an anonymous "an administrator" is what a phishing message
      // says.
      invitedBy: invitedBy ?? 'RISE',
      role,
      orgName: orgName ?? null,
      inviteUrl: `${appOrigin(req)}/register?token=${encodeURIComponent(token)}`,
      expiresAt,
      language,
    });
  } catch (err) {
    // No mail, no invitation. Leaving the row would put a live token in the
    // database that its subject has no way of ever seeing.
    await pool.query('DELETE FROM user_invitations WHERE id = $1', [rows[0].id]);
    return { status: 502, error: `Invitation email failed: ${err.message}` };
  }

  return { invitation: rows[0] };
}
