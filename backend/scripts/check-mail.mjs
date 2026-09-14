#!/usr/bin/env node
//
// Check the SMTP settings, before an invitation is the thing that discovers
// they are wrong.
//
//   node --env-file-if-exists=.env scripts/check-mail.mjs
//   node --env-file-if-exists=.env scripts/check-mail.mjs someone@example.org
//
// With no argument it only opens the connection and authenticates — nothing is
// sent. With an address it sends one plain message there.
//
// Worth running on the host rather than a laptop: the usual failure is not a
// bad password but a firewall, and the two look identical from the wrong
// machine. Most providers block outbound 25; 587 and 465 are the ports that
// actually work from a VPS.

import { mailConfig, verifyMail } from '../src/email/mailer.js';
import nodemailer from 'nodemailer';

const to = process.argv[2] ?? null;
const cfg = mailConfig();

console.log('SMTP configuration');
console.log(`  host      ${cfg.host ?? '(unset)'}`);
console.log(`  port      ${cfg.port}`);
console.log(`  from      ${cfg.from ?? '(unset)'}`);
console.log(`  user      ${process.env.SMTP_USER ?? '(none — unauthenticated relay)'}`);
console.log(`  password  ${process.env.SMTP_PASS ? '(set)' : '(not set)'}`);
console.log(
  `  TLS       ${process.env.SMTP_SECURE ?? `(from port: ${cfg.port === 465 ? 'implicit' : 'STARTTLS'})`}`
);
console.log();

if (!cfg.configured) {
  console.error('SMTP_HOST and EMAIL_FROM must both be set. Nothing to check.');
  process.exit(1);
}

// The From address is worth a look of its own. A mismatch between it and the
// authenticated mailbox is the most common reason mail is accepted by the
// server and then filed as spam by the recipient — SPF and DKIM are aligned
// against the domain in From, not against whoever sent it.
const fromDomain = /@([^>\s]+)/.exec(cfg.from)?.[1];
if (fromDomain && cfg.host && !cfg.host.includes(fromDomain.split('.').slice(-2).join('.'))) {
  console.warn(
    `Note: From is @${fromDomain} but the server is ${cfg.host}.\n` +
      '      That is fine if that domain\'s SPF authorises this server, and a\n' +
      '      spam folder if it does not. Worth checking before a class of\n' +
      '      students is invited.\n'
  );
}

try {
  await verifyMail();
  console.log('Connection and authentication: OK');
} catch (err) {
  console.error(`Connection failed: ${err.message}`);
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET') {
    console.error('  Usually a blocked port rather than a bad setting. Try 587, or 465.');
  }
  if (err.code === 'EAUTH') {
    console.error('  The server answered and rejected the credentials.');
    console.error('  For Google Workspace or Microsoft 365 with 2FA, an ordinary');
    console.error('  account password will not work — an app password is needed.');
  }
  process.exit(1);
}

if (!to) {
  console.log('\nNo recipient given, so nothing was sent. Pass an address to send a test.');
  process.exit(0);
}

const transport = nodemailer.createTransport({
  host: cfg.host,
  port: cfg.port,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : cfg.port === 465,
  requireTLS: cfg.port !== 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
    : undefined,
});

let info;
try {
  info = await transport.sendMail({
    from: cfg.from,
    to,
    subject: 'RISE — SMTP test',
    text:
      'This is a test message from the RISE platform.\n\n' +
      'If it arrived, invitation emails will too. Check whether it landed in the\n' +
      'inbox or in spam — both count as delivered to the server, and only one of\n' +
      'them is any use to a student.\n',
  });
} catch (err) {
  console.error(`\nSend failed: ${err.response ?? err.message}`);

  // 553 is not a fault, it is the server refusing to let you claim an address
  // you do not own — and it is the first thing that happens to anyone who sets
  // SMTP_USER and EMAIL_FROM to different domains, which is the natural thing
  // to do. Naming the fix here saves reading an SMTP reply code.
  if (err.responseCode === 553 || /not owned by user|Sender address rejected/i.test(err.response ?? '')) {
    console.error(
      '\n  EMAIL_FROM must be an address this account is allowed to send as.\n' +
        `  You authenticated as ${process.env.SMTP_USER}, but asked to send as\n` +
        `  ${cfg.from}.\n\n` +
        '  Either set EMAIL_FROM to that mailbox, or add the domain to the mail\n' +
        '  account as a verified sending domain and publish its SPF and DKIM\n' +
        '  records first. The second is what you want for real invitations; the\n' +
        '  first is what gets a test through today.'
    );
  }
  await transport.close();
  process.exit(1);
}

console.log(`Sent. Message id: ${info.messageId}`);
if (info.accepted?.length) console.log(`  accepted: ${info.accepted.join(', ')}`);
if (info.rejected?.length) console.log(`  rejected: ${info.rejected.join(', ')}`);
console.log('\nNow look at where it landed, not only that it sent.');
// Without this the pool holds the process open and a successful send looks
// like a hang.
transport.close();
