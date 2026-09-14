// The account page: a person changing their own details, downloading their own
// data, and asking the school to delete it.

import express from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../auth/middleware.js';
import { pool } from '../db/pool.js';
import { isSupportedLanguage, supportedLanguageMessage } from '../i18n/languages.js';
import { sendDataRequestEmail } from '../email/mailer.js';
import { buildPersonalExport, sendExport } from '../db/personal-export.js';

export const meRouter = express.Router();

// Article 12(3): one month to respond. Stored on the row rather than computed,
// so reinterpreting the deadline later cannot rewrite what was promised.
const RESPONSE_DAYS = 30;

const MIN_PASSWORD = 10;

async function currentUser(req) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, role, preferred_language FROM users WHERE id = $1`,
    [req.session.userId]
  );
  return rows[0] ?? null;
}

/** Update your own name and language. */
meRouter.patch('/', requireAuth, async (req, res) => {
  try {
    const { display_name: displayName, preferred_language: language } = req.body ?? {};

    if (displayName !== undefined) {
      const trimmed = String(displayName).trim();
      if (trimmed.length < 2 || trimmed.length > 120) {
        return res.status(400).json({ error: 'name must be between 2 and 120 characters' });
      }
    }
    if (language !== undefined && !isSupportedLanguage(language)) {
      return res.status(400).json({ error: supportedLanguageMessage() });
    }

    const { rows } = await pool.query(
      `UPDATE users
          SET display_name = COALESCE($1, display_name),
              preferred_language = COALESCE($2, preferred_language)
        WHERE id = $3
      RETURNING id, email, display_name, role, preferred_language`,
      [displayName === undefined ? null : String(displayName).trim(), language ?? null, req.session.userId]
    );
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('[me] update failed:', err);
    res.status(500).json({ error: 'failed to save' });
  }
});

/**
 * Change your own password.
 *
 * Failures carry a `code` beside the English `error`. The message is for logs
 * and for developers; the interface looks the code up in its own translations,
 * because an English sentence surfacing inside a Serbian page is a bug the
 * reader sees and cannot do anything about.
 */
meRouter.post('/password', requireAuth, async (req, res) => {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ code: 'missing', error: 'current and new password are required' });
    }
    if (String(newPassword).length < MIN_PASSWORD) {
      return res
        .status(400)
        .json({ code: 'tooShort', error: `new password must be at least ${MIN_PASSWORD} characters` });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      req.session.userId,
    ]);
    if (!rows[0] || !(await bcrypt.compare(String(currentPassword), rows[0].password_hash))) {
      return res.status(403).json({ code: 'wrongCurrent', error: 'current password is not correct' });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);

    // One transaction, because these two statements are one promise to the user.
    // They were separate `pool.query` calls, and when the second failed the
    // first had already committed: the password was changed while the interface
    // said it had not, which is the worst of the three possible outcomes.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        hash,
        req.session.userId,
      ]);
      // Sign out every *other* session. Someone changing their password because
      // a classmate watched them type is not safer while that classmate's
      // session is still valid. The current session is kept so the page does not
      // bounce to the login screen the moment it succeeds.
      //
      // `->>` and not `->`: connect-pg-simple stores `sess` as `json`, and
      // `json -> key` yields `json`, which has no equality operator against the
      // `jsonb` a `to_jsonb()` comparison produces. Comparing as text sidesteps
      // the question entirely.
      await client.query(
        `DELETE FROM session WHERE sess ->> 'userId' = $1 AND sid <> $2`,
        [req.session.userId, req.sessionID]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[me] password change failed:', err);
    res.status(500).json({ code: 'failed', error: 'failed to change password' });
  }
});

/** Record that the privacy notice was shown, and which version. */
meRouter.post('/notice', requireAuth, async (req, res) => {
  try {
    const { version, language } = req.body ?? {};
    if (!version) return res.status(400).json({ error: 'version is required' });
    await pool.query(
      `UPDATE users SET notice_version = $1, notice_language = $2, notice_ack_at = now()
        WHERE id = $3`,
      [String(version), isSupportedLanguage(language) ? language : null, req.session.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[me] notice acknowledgement failed:', err);
    res.status(500).json({ error: 'failed to record' });
  }
});

/**
 * Your own data, downloaded by you, immediately.
 *
 * Article 15 says a copy, within a month. Routing that through an
 * administrator meant a student waited on someone else to hand them their own
 * answers — and meant a member of staff read a transcript in order to deliver
 * it. Both were avoidable: the platform already knows who is asking, because
 * they are signed in.
 *
 * Not recorded in the audit log. That log exists to show which *staff member*
 * opened which student's record; a person reading their own data is not that
 * event, and logging it would bury the reads that matter. The request queue
 * still records anything asked of the school.
 */
meRouter.get('/export', requireAuth, async (req, res) => {
  try {
    const result = await buildPersonalExport(req.session.userId);
    if (!result) return res.status(401).json({ error: 'unauthenticated' });
    sendExport(res, result.user.id, result.payload);
  } catch (err) {
    console.error('[me] self export failed:', err);
    res.status(500).json({ error: 'failed to build your data export' });
  }
});

/** Your own open and past requests. */
meRouter.get('/data-requests', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, kind, requested_at, due_at, status, handled_at
         FROM data_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 20`,
      [req.session.userId]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('[me] data requests failed:', err);
    res.status(500).json({ error: 'failed to load' });
  }
});

/**
 * Ask the school to delete your data.
 *
 * Erasure only. A copy needs no request — `GET /export` above hands it over
 * immediately — and no administrator can produce one any more, because none of
 * them can read a transcript. Accepting an export request would open an
 * Article 12(3) clock against a promise nobody in the system is able to keep,
 * which is worse than not accepting it at all.
 *
 * `data_requests.kind` still permits 'export' and the audit log still permits
 * the 'export' action: both hold rows written before this changed, and a
 * constraint that invalidates history is not a tidier constraint. The rule
 * lives here, where it can be read.
 *
 * The row is the record; the email is only a nudge. See
 * migrations/0011_data_requests.sql for why it is not the other way round.
 */
meRouter.post('/data-requests', requireAuth, async (req, res) => {
  try {
    const kind = req.body?.kind;
    if (kind !== 'erasure') {
      return res.status(400).json({ error: 'kind must be erasure' });
    }
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'unauthenticated' });

    const due = new Date(Date.now() + RESPONSE_DAYS * 24 * 60 * 60 * 1000);
    let created;
    try {
      const { rows } = await pool.query(
        `INSERT INTO data_requests (user_id, kind, due_at) VALUES ($1, $2, $3)
         RETURNING id, kind, requested_at, due_at, status`,
        [user.id, kind, due]
      );
      created = rows[0];
    } catch (err) {
      // The partial unique index refuses a second open request of the same kind.
      if (err.code === '23505') {
        return res.status(409).json({ error: 'you already have a request of this kind waiting' });
      }
      throw err;
    }

    // Notification only, and deliberately thin: name, kind, due date, a link.
    // Sending a student's answers by email would defeat the point of the
    // exercise. Failure to send must not lose the request — the row is what
    // matters, and the queue shows it either way.
    try {
      await sendDataRequestEmail({ user, kind, dueAt: created.due_at, req });
    } catch (err) {
      console.error('[me] data-request email failed (request still recorded):', err.message ?? err);
    }

    res.status(201).json({ request: created });
  } catch (err) {
    console.error('[me] data request failed:', err);
    res.status(500).json({ error: 'failed to send the request' });
  }
});

/** Withdraw your own request, while it is still open. */
meRouter.delete('/data-requests/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE data_requests SET status = 'cancelled', handled_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [req.params.id, req.session.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'no open request found' });
    res.status(204).end();
  } catch (err) {
    console.error('[me] cancel request failed:', err);
    res.status(500).json({ error: 'failed to cancel' });
  }
});
