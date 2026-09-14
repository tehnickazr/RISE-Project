import express from 'express';
import { requireRole, withActor } from '../auth/middleware.js';
import { issueInvitation } from '../invitations/issue.js';
import { TeacherInviteSchema } from '../invitations/schema.js';
import { isSupportedLanguage, supportedLanguageMessage } from '../i18n/languages.js';

export const teacherRouter = express.Router();

teacherRouter.use(requireRole('teacher'), withActor);

/**
 * Invite a student into this teacher's school.
 *
 * Teachers asked for this after the first real session in Serbia: they are the
 * ones standing in front of a class that has no accounts yet, and routing every
 * new student through the school administrator makes a teacher wait on somebody
 * else to start a lesson.
 *
 * The student joins in exactly the way an administrator's invitation would make
 * them join — same organization, same email, same registration page. Nothing
 * about this account records that a teacher rather than an administrator issued
 * it, beyond `invited_by`, because nothing should depend on it.
 */
teacherRouter.post('/invitations', async (req, res) => {
  const parsed = TeacherInviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const input = parsed.data;

  const language = input.preferred_language || req.actor.org_default_language || 'en';
  if (!isSupportedLanguage(language)) {
    return res.status(400).json({ error: supportedLanguageMessage() });
  }

  const result = await issueInvitation({
    req,
    email: input.email,
    displayName: input.display_name,
    role: 'student',
    language,
    orgId: req.actor.org_id,
    orgName: req.actor.org_name,
    invitedBy: req.actor.display_name,
  });

  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ invitation: result.invitation });
});
