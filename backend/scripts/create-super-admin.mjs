#!/usr/bin/env node
//
// Create the first platform administrator.
//
// A script rather than part of migration 0015, for one reason: a migration is
// text in git, and a password in a migration is a password in git forever. This
// generates one, prints it once, and stores only the hash.
//
//   node --env-file-if-exists=.env scripts/create-super-admin.mjs <email> "<name>"
//
// The account sits outside every organization and can read no student data —
// there is no endpoint that would return any. It exists to provision
// organizations and to invite their first administrators.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [email, displayName] = process.argv.slice(2);
if (!email || !displayName) {
  console.error('usage: create-super-admin.mjs <email> "<display name>"');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

// 18 url-safe characters. Long enough that this being read over someone's
// shoulder in a terminal is not the end of it, short enough to type once.
const password = crypto.randomBytes(14).toString('base64url');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const existing = await client.query('SELECT id, role FROM users WHERE email = $1', [
    email.toLowerCase(),
  ]);
  if (existing.rows.length > 0) {
    console.error(
      `refusing: ${email} already exists as ${existing.rows[0].role}. ` +
        'Delete it or choose another address rather than silently changing a role.'
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, display_name, role, preferred_language, org_id)
     VALUES ($1, $2, $3, 'super_admin', 'en', NULL)
     RETURNING id, email, display_name, role`,
    [email.toLowerCase(), hash, displayName]
  );

  console.log('');
  console.log('  super administrator created');
  console.log('  ---------------------------');
  console.log(`  email    ${rows[0].email}`);
  console.log(`  password ${password}`);
  console.log('');
  console.log('  Shown once. Change it after signing in — the account page works');
  console.log('  for this role like any other.');
  console.log('');
} finally {
  await client.end();
}
