import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from './db/pool.js';

const HASH_ROUNDS = 10;

/**
 * A demo organisation and its accounts, for local development and staging.
 *
 * Passwords are NOT hardcoded. Each run either takes them from the environment
 * or generates a random one and prints it once. The previous fixed
 * `password123` was published in Report No. 2 and left live on production —
 * see REVIEW §4.5/§4.6.
 *
 *   SEED_PASSWORD=...        password for the demo student/teacher accounts
 *   SEED_ADMIN_PASSWORD=...  password for the admin account
 *
 * Nothing here runs unless you invoke `npm run seed` explicitly.
 *
 * **The organisation is not decoration.** Migration 0015 requires every account
 * except a platform administrator to belong to one — `users_org_scope_chk` —
 * and this file predates it, so from 3 September until this was fixed the seed
 * died on that constraint. `create-database.sh` runs the seed by default, so
 * creating a fresh database failed with it: the break was invisible because it
 * only affected the one path nobody walks on a running system, and is exactly
 * the path a new adopter starts on.
 *
 * No platform administrator is created here, deliberately. That account grants
 * the whole platform and is bootstrapped on its own, by
 * `scripts/create-super-admin.mjs`.
 */

// One organisation, and the demo accounts belong to it. Its default language is
// English while the accounts below span all four, which is not an oversight: a
// student whose own language differs from their school's default is the normal
// case in this project, and a seed where they always match would hide the bugs
// that live in the difference.
const ORG = {
  slug: 'demo-school',
  name: 'Demo School',
  country: 'RS',
  default_language: 'en',
};

// One student per content language, so every language has a test account whose
// dashboard is not empty.
const USERS = [
  { email: 'student.sr@rise.local', display_name: 'Student SR', role: 'student', lang: 'sr' },
  { email: 'student.fr@rise.local', display_name: 'Student FR', role: 'student', lang: 'fr' },
  { email: 'student.pt@rise.local', display_name: 'Student PT', role: 'student', lang: 'pt' },
  { email: 'student.en@rise.local', display_name: 'Student EN', role: 'student', lang: 'en' },
  // Shorter interview, to exercise the per-student length override.
  {
    email: 'student.short@rise.local',
    display_name: 'Student Short',
    role: 'student',
    lang: 'sr',
    question_count: 5,
  },
  { email: 'teacher.sr@rise.local', display_name: 'Teacher SR', role: 'teacher', lang: 'sr' },
  { email: 'teacher.fr@rise.local', display_name: 'Teacher FR', role: 'teacher', lang: 'fr' },
  { email: 'teacher.pt@rise.local', display_name: 'Teacher PT', role: 'teacher', lang: 'pt' },
  { email: 'admin@rise.local', display_name: 'RISE Admin', role: 'admin', lang: 'en', admin: true },
];

function newPassword() {
  // 18 url-safe chars — long enough that a leaked demo account is not a foothold.
  return crypto.randomBytes(14).toString('base64url');
}

if (process.env.NODE_ENV === 'production' && !process.env.SEED_ALLOW_PRODUCTION) {
  console.error('[seed] refusing to run with NODE_ENV=production.');
  console.error('[seed] set SEED_ALLOW_PRODUCTION=1 if this is really what you want.');
  process.exit(1);
}

const userPassword = process.env.SEED_PASSWORD ?? newPassword();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? newPassword();
const generated = { user: !process.env.SEED_PASSWORD, admin: !process.env.SEED_ADMIN_PASSWORD };

try {
  const userHash = await bcrypt.hash(userPassword, HASH_ROUNDS);
  const adminHash = await bcrypt.hash(adminPassword, HASH_ROUNDS);

  // Upsert on the slug rather than insert: re-running the seed must not create
  // a second Demo School, and must not fail when the first one is there.
  const { rows: orgRows } = await pool.query(
    `INSERT INTO organizations (slug, name, country, default_language)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           country = EXCLUDED.country,
           default_language = EXCLUDED.default_language
     RETURNING id, slug, name`,
    [ORG.slug, ORG.name, ORG.country, ORG.default_language]
  );
  const org = orgRows[0];

  for (const u of USERS) {
    await pool.query(
      `INSERT INTO users (email, password_hash, display_name, role, preferred_language,
                          question_count, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             display_name = EXCLUDED.display_name,
             role = EXCLUDED.role,
             preferred_language = EXCLUDED.preferred_language,
             question_count = EXCLUDED.question_count,
             org_id = EXCLUDED.org_id`,
      [
        u.email,
        u.admin ? adminHash : userHash,
        u.display_name,
        u.role,
        u.lang,
        u.question_count ?? null,
        org.id,
      ]
    );
  }

  const { rows } = await pool.query(
    `SELECT email, role, preferred_language, question_count
       FROM users WHERE org_id = $1 ORDER BY role, email`,
    [org.id]
  );
  console.log(`\n[seed] organisation: ${org.name} (${org.slug}), default language ${ORG.default_language}`);
  console.log(`[seed] ${rows.length} user(s) in it:`);
  for (const r of rows) {
    const len = r.question_count ? `  questions=${r.question_count}` : '';
    console.log(`  ${r.role.padEnd(8)} ${r.email.padEnd(28)} lang=${r.preferred_language}${len}`);
  }

  console.log('\n[seed] passwords:');
  console.log(`  demo accounts : ${userPassword}${generated.user ? '   (generated — copy it now)' : '   (from SEED_PASSWORD)'}`);
  console.log(`  admin@        : ${adminPassword}${generated.admin ? '   (generated — copy it now)' : '   (from SEED_ADMIN_PASSWORD)'}`);
  if (generated.user || generated.admin) {
    console.log('\n[seed] These are shown once and are not stored anywhere in plain text.');
    console.log('[seed] Re-running the seed issues new ones.');
  }
  console.log('\n[seed] No platform administrator was created — that one grants the whole');
  console.log('[seed] platform and is bootstrapped separately:');
  console.log('[seed]   node --env-file-if-exists=.env scripts/create-super-admin.mjs <email> "<name>"');
  console.log();
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
