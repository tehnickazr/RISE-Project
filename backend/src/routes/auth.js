import express from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { schoolSettings, supportContacts } from '../db/school-settings.js';
import { dpoLine } from '../settings/school.js';
import { isSupportedLanguage, supportedLanguageMessage } from '../i18n/languages.js';
import crypto from 'node:crypto';
import { appOrigin, sendPasswordResetEmail } from '../email/mailer.js';

export const authRouter = express.Router();

// Two limiters, because a school is the awkward case: thirty students log in
// from one NAT address within a few minutes, and a naive per-IP limit would
// lock out the class it is meant to protect.
//
// Credential stuffing looks different from a classroom — many *emails* from one
// address, or many attempts against one email. So the tight limit is keyed on
// the pair, and the per-IP limit is left loose enough for a full class.
//
// Successful logins are not counted, so a working account never contributes.

const perAccountLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email ?? '').toLowerCase().trim();
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  message: { error: 'too many attempts, try again later' },
});

const perAddressLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too many attempts, try again later' },
});

authRouter.post('/login', perAddressLogin, perAccountLogin, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.display_name, u.role, u.preferred_language,
            u.notice_version, u.status,
            u.org_id, o.status AS org_status, o.name AS org_name, o.slug AS org_slug,
            o.default_language AS org_default_language
       FROM users u
       LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.email = $1`,
    [email.toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  // Checked after the password, not before: refusing early would let anyone
  // discover which addresses belong to a suspended school without a credential.
  if (user.role !== 'super_admin' && user.org_status !== 'active') {
    return res.status(403).json({ error: 'This account is not active. Contact your school.' });
  }
  // The individual account, same placement and same reasoning as the school
  // above it. Deliberately the same sentence, too: "your account is suspended"
  // and "your school is suspended" are different facts, and which one applies
  // to a given address is not something to hand out to whoever asks.
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account is not active. Contact your school.' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.orgId = user.org_id;
  res.json({ user: publicUser(user) });
});

/**
 * The one shape a signed-in person has.
 *
 * Login and /api/me used to build this separately, and login's copy was missing
 * the organisation — so an administrator who had just signed in saw an invite
 * form defaulted to English, while the same administrator after a page reload
 * saw it defaulted to their school's language. Two payloads for one concept
 * drift, and they drift silently, because each is correct on its own.
 */
function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    preferred_language: row.preferred_language,
    org_id: row.org_id ?? null,
    org_name: row.org_name ?? null,
    org_slug: row.org_slug ?? null,
    org_default_language: row.org_default_language ?? null,
    // The notice version this person last acknowledged, so the client can tell
    // whether to show it again. Null for the seeded accounts, which predate the
    // acknowledgement, and for anyone whose stamp is older than the current
    // notice — both of which mean the same thing to the reader: they have not
    // seen this version.
    notice_version: row.notice_version ?? null,
  };
}

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('rise.sid');
    res.status(204).end();
  });
});

authRouter.get('/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.role, u.preferred_language,
            u.notice_version, u.status,
            u.org_id, o.name AS org_name, o.slug AS org_slug,
            o.default_language AS org_default_language
       FROM users u
       LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.id = $1`,
    [req.session.userId]
  );
  // A suspended account is treated exactly like a deleted one here. Suspending
  // deletes the open sessions, so this should never fire — but this is the call
  // the client makes on every page load to decide whether anyone is signed in,
  // and it is the right place to be certain rather than to assume.
  if (rows.length === 0 || rows[0].status !== 'active') {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'unauthenticated' });
  }
  // The support contacts travel with the session rather than on their own
  // endpoint. Every error state in the interface wants them — an interview that
  // will not load, a sign-in that fails, an invitation that has expired — and a
  // second round trip at the moment something is already broken is the round
  // trip most likely to fail too.
  res.json({
    user: publicUser(rows[0]),
    support: await supportContacts(rows[0].org_id),
  });
});

/**
 * The school's own paragraphs of the privacy notice.
 *
 * Its own endpoint rather than part of /api/me: this is a dozen fields read by
 * one page that most people open once, and /api/me is called on every load.
 */
authRouter.get('/me/notice-settings', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  const { rows } = await pool.query('SELECT org_id FROM users WHERE id = $1', [
    req.session.userId,
  ]);
  if (!rows[0]) return res.status(401).json({ error: 'unauthenticated' });
  const data = await schoolSettings(rows[0].org_id);
  // Only what a notice renders. The support fields live on the same row and are
  // none of the notice's business; `updated_by` is a staff identity and none of
  // a student's.
  const s = data?.settings ?? {};
  res.json({
    notice_settings: {
      short_name: s.short_name,
      legal_name: s.legal_name,
      dpo: dpoLine(s),
      lawful_basis_students: s.lawful_basis_students,
      lawful_basis_staff: s.lawful_basis_staff,
      retention_answers: period(s.retention_answers_value, s.retention_answers_unit),
      retention_account: period(s.retention_account_value, s.retention_account_unit),
      retention_staff: period(s.retention_staff_value, s.retention_staff_unit),
      supervisory_authority: s.supervisory_authority,
    },
  });
});

/** A period is two fields or nothing — half of one renders no sentence. */
function period(value, unit) {
  return value && unit ? { value, unit } : null;
}

authRouter.post('/me/language', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  const { language } = req.body ?? {};
  if (!isSupportedLanguage(language)) {
    return res.status(400).json({ error: supportedLanguageMessage() });
  }
  await pool.query('UPDATE users SET preferred_language = $1 WHERE id = $2', [
    language,
    req.session.userId,
  ]);
  res.json({ ok: true, preferred_language: language });
});

// ---------- forgetting a password ----------
//
// There was no way back before this. The only password endpoint changes your
// own while you are already signed in, so a student who could not get in had
// exactly one recovery: an administrator deleting the account and inviting it
// again, which destroys the interview history and their place in the measured
// cohort.
//
// **This does not solve it for the October cohort, and should not be read as
// though it does.** Those accounts are pseudonymous — `student.22okt.1@
// rise.local` is not a mailbox — so no link sent to them arrives anywhere. For
// that population recovery has to be an administrator issuing a new password
// in person, which is tracked separately. This route is for everyone with a
// real address: every member of staff, and the students already on the
// platform.

const RESET_TTL_MINUTES = Number(process.env.RESET_TTL_MINUTES ?? 60);

/** Addresses on this domain are pseudonyms and receive nothing. */
function isReachable(email) {
  return !/@rise\.local$/i.test(String(email ?? ''));
}

function resetHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Two limiters again, and for the reason the login ones exist: a school is one
// address, and thirty students asking at once is a class, not an attack. The
// tight limit is per address, the loose one per source.
const perAddressReset = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? '').toLowerCase().trim()}`,
  message: { error: 'too many requests, try again later' },
});

const perSourceReset = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too many requests, try again later' },
});

/**
 * Ask for a reset link.
 *
 * **Always answers the same way.** Whether the address has an account, has a
 * pseudonymous one that cannot receive mail, or has never existed, the reply is
 * `{ ok: true }`. Anything else turns this endpoint into a way of asking the
 * platform which of a list of addresses belongs to a student — and the answer
 * to "does this child have an account here" is not one to hand out.
 */
authRouter.post('/forgot-password', perSourceReset, perAddressReset, async (req, res) => {
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  // Answered before any work is done, so the response time does not vary with
  // whether the account exists.
  res.json({ ok: true });
  if (!email) return;

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.preferred_language
         FROM users u
         LEFT JOIN organizations o ON o.id = u.org_id
        WHERE u.email = $1
          AND u.status = 'active'
          AND (u.role = 'super_admin' OR o.status = 'active')`,
      [email]
    );
    const user = rows[0];
    if (!user || !isReachable(user.email)) return;

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    // Any earlier link for this person stops working. Asking twice because the
    // first mail was slow should not leave two live keys to the same account.
    await pool.query(
      `UPDATE password_resets SET used_at = now()
        WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, resetHash(token), expiresAt]
    );

    await sendPasswordResetEmail({
      to: user.email,
      displayName: user.display_name,
      resetUrl: `${appOrigin(req)}/reset?token=${encodeURIComponent(token)}`,
      expiresAt,
      language: user.preferred_language,
    });
  } catch (err) {
    // Logged by shape, never with the address: a log line naming who asked to
    // reset a password is a record of who forgot one.
    console.error('[auth] password reset request failed:', err.message);
  }
});

/**
 * Is this reset token still usable, and whose is it?
 *
 * The language comes back because **the token identifies the person**. The
 * sign-in and forgot-password screens are English because nobody has said who
 * they are yet; that reasoning does not extend to this one, and shipping it in
 * English meant a Serbian student got a Serbian email and then an English form
 * — which is the exact oversight the invitation flow already records fixing.
 *
 * Returning it is not a disclosure: only the holder of the token can ask, and
 * the answer is which of four languages a page should be drawn in.
 */
authRouter.get('/reset-password/:token', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.preferred_language
       FROM password_resets r
       JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [resetHash(req.params.token)]
  );
  if (rows.length === 0) return res.status(410).json({ error: 'This link is no longer valid', code: 'expired' });
  res.json({ ok: true, language: rows[0].preferred_language ?? null });
});

/** Set a new password using a reset token. */
authRouter.post('/reset-password', perSourceReset, async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || typeof password !== 'string') {
    return res.status(400).json({ error: 'token and password are required', code: 'missing' });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'password must be at least 10 characters', code: 'tooShort' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE, so two submissions of the same link cannot both win.
    const { rows } = await client.query(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [resetHash(token)]
    );
    const reset = rows[0];
    if (!reset) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This link is no longer valid', code: 'expired' });
    }

    const hash = await bcrypt.hash(password, 10);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
    await client.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
    // Every session belonging to this person goes, including any the someone
    // who prompted the reset might be holding. `->>` and not `->` for the
    // reason the change-password route records: connect-pg-simple stores
    // `sess` as `json`, which has no equality operator against `jsonb`.
    await client.query(`DELETE FROM session WHERE sess ->> 'userId' = $1`, [reset.user_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[auth] password reset failed:', err.message);
    res.status(500).json({ error: 'could not reset the password', code: 'failed' });
  } finally {
    client.release();
  }
});
