import { z } from 'zod';

/**
 * **There is no `role` field here, and that is the whole point.**
 *
 * A teacher invites students and nothing else. That is not expressed as a
 * default which a request body could override, and not as a validation rule
 * that rejects the other values — the field is simply absent, and because
 * `z.object` strips what it does not declare, a body carrying
 * `"role": "admin"` arrives at the handler without it. The route writes the
 * role as a literal. Same reasoning for the organization: the two fields that
 * decide what an account can see are read from the inviter, never from the
 * wire.
 *
 * It lives in its own module, apart from the route, so the test that guards
 * this can import it without a database.
 */
export const TeacherInviteSchema = z.object({
  email: z.string().trim().email(),
  display_name: z.string().trim().min(1).max(120),
  // Absent means the school's own, which this schema cannot know. Filling in
  // 'en' here would hard-code the wrong answer for every partner and look like
  // a considered choice.
  preferred_language: z.string().trim().optional(),
});
