// The platform level: organizations, and the people who administer them.
//
// A super administrator provisions organizations and invites their first
// administrator. It deliberately **cannot read student data** — there is no
// endpoint here that returns a transcript, an answer, or a score, and none
// should be added. That is not an interface choice; it is the claim the DPIA
// and the transfer assessment both rest on, and it only holds while the
// endpoints do not exist.

import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireSuperAdmin } from '../auth/middleware.js';
import { pool } from '../db/pool.js';
import { appOrigin, inviteExpiryHours, sendInviteEmail } from '../email/mailer.js';
import { isSupportedLanguage, supportedLanguageMessage } from '../i18n/languages.js';
import { platformLimits } from '../db/limits.js';
import { PlatformLimitsSchema } from '../sessions/limits.js';
import { PlatformSupportSchema } from '../settings/school.js';

export const platformRouter = express.Router();

platformRouter.use(requireSuperAdmin);

const OrgSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'slug must be lowercase letters, digits and hyphens'),
  country: z.string().trim().max(80).optional(),
  default_language: z.string().trim().optional(),
});

const PlatformInviteSchema = z.object({
  email: z.string().trim().email(),
  display_name: z.string().trim().min(1).max(120),
  // A super administrator invites administrators, and other super
  // administrators. Not teachers and not students — those belong to a school
  // and are its administrator's to invite.
  role: z.enum(['admin', 'super_admin']),
  org_id: z.string().uuid().optional(),
  preferred_language: z.string().trim().optional().default('en'),
});

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Organizations, with counts.
 *
 * Counts, never content: how many people are in a school is platform
 * administration, what they wrote is not.
 */
platformRouter.get('/organizations', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.slug, o.name, o.country, o.default_language, o.status, o.created_at,
            (SELECT count(*)::int FROM users u WHERE u.org_id = o.id) AS members,
            (SELECT count(*)::int FROM users u WHERE u.org_id = o.id AND u.role = 'admin') AS admins,
            (SELECT count(*)::int FROM users u WHERE u.org_id = o.id AND u.role = 'teacher') AS teachers,
            (SELECT count(*)::int FROM users u WHERE u.org_id = o.id AND u.role = 'student') AS students,
            (SELECT count(*)::int FROM groups g WHERE g.org_id = o.id) AS groups
       FROM organizations o
      ORDER BY o.name`
  );
  res.json({ organizations: rows });
});

platformRouter.post('/organizations', async (req, res) => {
  const parsed = OrgSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const input = parsed.data;
  if (input.default_language && !isSupportedLanguage(input.default_language)) {
    return res.status(400).json({ error: supportedLanguageMessage() });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO organizations (slug, name, country, default_language)
       VALUES ($1, $2, $3, $4)
       RETURNING id, slug, name, country, default_language, status, created_at`,
      [input.slug, input.name, input.country ?? null, input.default_language ?? null]
    );
    res.status(201).json({ organization: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An organisation with this slug already exists' });
    }
    throw err;
  }
});

/**
 * Suspend or reactivate.
 *
 * Suspending blocks sign-in for every member immediately — `withActor` re-reads
 * the status on each request rather than trusting the session — and touches no
 * data. `closed` is not settable here: closing an organization destroys its
 * students' records and should not be one dropdown away from suspending it.
 */
platformRouter.post('/organizations/:id/status', async (req, res) => {
  const status = req.body?.status;
  if (status !== 'active' && status !== 'suspended') {
    return res.status(400).json({ error: 'status must be active or suspended' });
  }
  const { rows } = await pool.query(
    `UPDATE organizations SET status = $1 WHERE id = $2 RETURNING id, slug, name, status`,
    [status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Organisation not found' });
  res.json({ organization: rows[0] });
});

/** Invite an organization's administrator, or another super administrator. */
platformRouter.post('/invitations', async (req, res) => {
  const parsed = PlatformInviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const input = parsed.data;
  const email = input.email.toLowerCase();

  if (!isSupportedLanguage(input.preferred_language)) {
    return res.status(400).json({ error: supportedLanguageMessage() });
  }
  // A super administrator belongs to no organization; an administrator must
  // belong to exactly one. The database enforces this too — this is so the
  // caller gets a sentence rather than a constraint violation.
  if (input.role === 'super_admin' && input.org_id) {
    return res.status(400).json({ error: 'A super administrator does not belong to an organisation' });
  }
  if (input.role === 'admin' && !input.org_id) {
    return res.status(400).json({ error: 'An administrator needs an organisation' });
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  // The school this person is being invited into, for the subject line and the
  // opening sentence. A platform administrator belongs to none, so it stays
  // null and the text falls back to a version that names no organisation.
  let orgName = null;
  if (input.org_id) {
    const { rows: orgRows } = await pool.query('SELECT name FROM organizations WHERE id = $1', [
      input.org_id,
    ]);
    orgName = orgRows[0]?.name ?? null;
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + inviteExpiryHours() * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO user_invitations
       (email, display_name, role, preferred_language, token_hash, expires_at, invited_by, org_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, email, display_name, role, preferred_language, expires_at, created_at`,
    [
      email,
      input.display_name,
      input.role,
      input.preferred_language,
      tokenHash(token),
      expiresAt,
      req.session.userId,
      input.org_id ?? null,
    ]
  );

  try {
    const inviteUrl = `${appOrigin(req)}/register?token=${encodeURIComponent(token)}`;
    await sendInviteEmail({
      to: email,
      displayName: input.display_name,
      invitedBy: req.actor?.display_name ?? 'RISE',
      role: input.role,
      // The organization being invited into, which for a platform invitation
      // is the school named on the form rather than the inviter's own — a
      // platform administrator belongs to none.
      orgName: orgName ?? null,
      inviteUrl,
      expiresAt,
      language: input.preferred_language,
    });
  } catch (err) {
    await pool.query('DELETE FROM user_invitations WHERE id = $1', [rows[0].id]);
    return res.status(502).json({ error: `Invitation email failed: ${err.message}` });
  }

  res.status(201).json({ invitation: rows[0] });
});

// ---------------------------------------------------------------------------
// Platform defaults for session limits
// ---------------------------------------------------------------------------
//
// The numbers every school starts from. Changing them takes effect immediately
// for every school that has not set its own — which is the point of having a
// default rather than a value copied into each organisation at creation.

platformRouter.get('/limits', async (_req, res) => {
  res.json({ platform: await platformLimits() });
});

platformRouter.put('/limits', async (req, res) => {
  const parsed = PlatformLimitsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { attempts_per_scenario, total_interviews, cooldown_days } = parsed.data;
  // Upsert rather than update. The row is created by the schema and by
  // migration 0021, so it is there in every environment that exists today —
  // but an UPDATE that matches nothing returns nothing, and this endpoint
  // would answer a save with silence rather than an error. A settings write
  // that quietly does nothing is the worst of the three possible outcomes.
  const { rows } = await pool.query(
    `INSERT INTO platform_settings (id, attempts_per_scenario, total_interviews, cooldown_days, updated_by)
     VALUES (true, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
        SET attempts_per_scenario = EXCLUDED.attempts_per_scenario,
            total_interviews      = EXCLUDED.total_interviews,
            cooldown_days         = EXCLUDED.cooldown_days,
            updated_at            = now(),
            updated_by            = EXCLUDED.updated_by
      RETURNING attempts_per_scenario, total_interviews, cooldown_days,
                updated_at, updated_by`,
    [attempts_per_scenario, total_interviews, cooldown_days, req.session.userId]
  );
  res.json({ platform: rows[0] });
});

// ---------------------------------------------------------------------------
// The platform's own support contact
// ---------------------------------------------------------------------------
//
// One address, answered by one team, shown read-only inside every school. A
// school editing it would change who answers for every other school's students,
// which is the same reason the platform's interview limits are not editable
// there either.

platformRouter.get('/support', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT support_name, support_email FROM platform_settings WHERE id = true'
  );
  res.json({ platform: rows[0] ?? { support_name: null, support_email: null } });
});

platformRouter.put('/support', async (req, res) => {
  const parsed = PlatformSupportSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { support_name, support_email } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO platform_settings (id, support_name, support_email, updated_by)
     VALUES (true, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE
        SET support_name = EXCLUDED.support_name,
            support_email = EXCLUDED.support_email,
            updated_at   = now(),
            updated_by   = EXCLUDED.updated_by
      RETURNING support_name, support_email`,
    [support_name, support_email, req.session.userId]
  );
  res.json({ platform: rows[0] });
});
