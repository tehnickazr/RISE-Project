import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { appOrigin, sendWelcomeEmail } from '../email/mailer.js';

export const invitationsRouter = express.Router();

// The acknowledgement recorded at sign-up. Optional so an older client cannot
// be locked out mid-deploy, but the version is what makes the record useful:
// when the notice changes materially, everyone with an older stamp is shown the
// new one. See DPIA.md section 4.1.
const AcceptSchema = z.object({
  notice_version: z.string().trim().max(20).optional(),
  notice_language: z.enum(['sr', 'en', 'fr', 'pt']).optional(),
  password: z.string().min(10, 'Password must be at least 10 characters'),
});

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** The school's name for the welcome mail, or null for a platform account. */
async function organizationName(orgId) {
  if (!orgId) return null;
  const { rows } = await pool.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
  return rows[0]?.name ?? null;
}

async function findValidInvitation(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT id, email, display_name, role, preferred_language, expires_at, accepted_at
     FROM user_invitations
     WHERE token_hash = $1`,
    [tokenHash(token)]
  );
  const invitation = rows[0];
  if (!invitation) return null;
  if (invitation.accepted_at) return { ...invitation, invalid_reason: 'accepted' };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return { ...invitation, invalid_reason: 'expired' };
  }
  return invitation;
}

/**
 * A dead invitation, answered so the page can say something useful.
 *
 * `code` is what the interface translates; the English `error` is for logs.
 * `language` comes from the invitation row where there is one, because the
 * person holding this link was sent it in a particular language and being
 * answered in English is the thing this endpoint is trying to stop. It is not
 * a disclosure: the language of an invitation is only readable by someone who
 * already holds its token.
 *
 * Most of these are not really errors. **The common case is a student who
 * reopened the invitation email to find the address of the platform**, clicked
 * the link out of habit, and landed here — their account exists and works.
 * `accepted` should read as a signpost, not a failure.
 */
function deadInvitation(res, status, code, error, invitation) {
  return res.status(status).json({
    error,
    code,
    language: invitation?.preferred_language ?? null,
  });
}

invitationsRouter.get('/:token', async (req, res) => {
  const invitation = await findValidInvitation(req.params.token);
  if (!invitation) {
    return deadInvitation(res, 404, 'notFound', 'Invitation not found');
  }
  if (invitation.invalid_reason === 'accepted') {
    return deadInvitation(res, 410, 'accepted', 'Invitation has already been accepted', invitation);
  }
  if (invitation.invalid_reason === 'expired') {
    return deadInvitation(res, 410, 'expired', 'Invitation has expired', invitation);
  }
  res.json({
    invitation: {
      email: invitation.email,
      display_name: invitation.display_name,
      role: invitation.role,
      preferred_language: invitation.preferred_language,
      expires_at: invitation.expires_at,
    },
  });
});

invitationsRouter.post('/:token/accept', async (req, res) => {
  const parsed = AcceptSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, email, display_name, role, preferred_language, expires_at, accepted_at, org_id
       FROM user_invitations
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash(req.params.token)]
    );
    // The same three answers as the lookup above, and carrying the same codes,
    // because a token can die between the page loading and the form being
    // submitted — someone opening an invitation shortly before it expires and
    // then choosing a password unhurriedly. Landing that on a raw English
    // sentence, after they have just typed a password twice, is the worst
    // moment of the three to do it.
    const invitation = rows[0];
    if (!invitation) {
      await client.query('ROLLBACK');
      return deadInvitation(res, 404, 'notFound', 'Invitation not found');
    }
    if (invitation.accepted_at) {
      await client.query('ROLLBACK');
      return deadInvitation(res, 410, 'accepted', 'Invitation has already been accepted', invitation);
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return deadInvitation(res, 410, 'expired', 'Invitation has expired', invitation);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const created = await client.query(
      // The organization comes from the invitation, which came from the
      // administrator who issued it. Accepting a link cannot put someone in a
      // school nobody chose.
      `INSERT INTO users (email, password_hash, display_name, role, preferred_language,
                          notice_version, notice_language, notice_ack_at, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END, $8)
       RETURNING id, email, display_name, role, preferred_language`,
      [
        invitation.email,
        passwordHash,
        invitation.display_name,
        invitation.role,
        invitation.preferred_language,
        parsed.data.notice_version ?? null,
        parsed.data.notice_language ?? invitation.preferred_language ?? null,
        invitation.org_id,
      ]
    );
    // The identity now lives on the `users` row. Keeping the invitation's copy
    // would leave a second record of a student's real name and address behind
    // an otherwise pseudonymous account, read by nothing. The row itself stays
    // so that a reused link still answers "already accepted" — see migration
    // 0013.
    await client.query(
      `UPDATE user_invitations
          SET accepted_at = now(), email = NULL, display_name = NULL
        WHERE id = $1`,
      [invitation.id]
    );
    await client.query('COMMIT');

    const user = created.rows[0];
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.orgId = invitation.org_id ?? null;
    res.status(201).json({ user });

    // After the response, and deliberately not awaited before it: the account
    // exists and the person is signed in, so a mail server having a bad minute
    // must not turn a successful registration into an error. Failure is logged
    // and swallowed — the same rule the data-request notice follows.
    //
    // This is the email they keep. Students in the Serbian testing could not
    // remember the address of the platform, reopened the invitation, and found
    // a link that had already been spent. Nothing until now ever told them
    // where to come back to.
    sendWelcomeEmail({
      to: user.email,
      displayName: user.display_name,
      role: user.role,
      orgName: await organizationName(invitation.org_id),
      signInUrl: `${appOrigin(req)}/login`,
      language: user.preferred_language,
    }).catch((err) => {
      console.error(`[invitations] welcome email to ${user.id} failed:`, err.message);
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    throw err;
  } finally {
    client.release();
  }
});
