#!/usr/bin/env node
//
// Append a prepared content set (scenarios, questions, rubrics, glossary) to a
// spreadsheet.
//
//   node --env-file=.env scripts/import-content.mjs <dir> --sheet <id>
//   node --env-file=.env scripts/import-content.mjs <dir> --sheet <id> --write
//
// Dry run by default. `--write` applies.
//
// Why this exists rather than pasting by hand: a paste lands values by position,
// so a column-order mismatch writes every value into the wrong field silently;
// it needs the grid grown first, which Sheets will not do mid-paste; and it is
// four separate manual operations with no record of what was done.
//
// Rows are rebuilt against the target tab's own header, by name, so a CSV whose
// columns are in a different order still lands correctly. That is not
// hypothetical: the Kit 2 glossary CSV starts `occupation, term_fr, term_en`
// where the sheet's tab starts `scenario_id, occupation, term_sr` — pasting it
// would have written every term into the wrong field.
//
// Existing rows are never touched. This only ever adds.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { JWT } from 'google-auth-library';

// Guard only. The production content sheet is shared by rise and rise2, so an
// import aimed at it is live for students the moment it lands. Writing to it
// takes a second, explicit flag on top of --write.
const PRODUCTION_SHEET_ID = '1bEYB0yTDoWME8MsEpL997J9ErhSzrg_EZ4my9-NwLCc';

const TABS = ['scenarios', 'questions', 'rubrics', 'glossary'];

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const write = args.includes('--write');
const allowProduction = args.includes('--yes-production');
const only = flag('tabs')?.split(',');
const sheetId = flag('sheet') ?? process.env.GOOGLE_SPREADSHEET_ID;

if (!dir || !sheetId) {
  console.error('usage: import-content.mjs <dir> --sheet <spreadsheet id> [--tabs a,b] [--write]');
  process.exit(1);
}

if (sheetId === PRODUCTION_SHEET_ID && write && !allowProduction) {
  console.error(`\nREFUSING: ${sheetId} is the production content sheet.`);
  console.error('Production and staging both read it, so this would be live for students immediately.');
  console.error('Rehearse on a staging copy first. To proceed anyway, add --yes-production.\n');
  process.exit(1);
}

/** Minimal RFC4180 reader — fields may contain commas, quotes and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

const auth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const tokenResponse = await auth.getAccessToken();
const token = tokenResponse?.token ?? tokenResponse;
const api = (suffix, init) =>
  fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${suffix}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

const meta = await (await api('?fields=properties.title,sheets.properties')).json();
if (meta.error) {
  console.error(`Cannot read ${sheetId}: ${meta.error.message}`);
  console.error('Is it shared with', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, '?');
  process.exit(1);
}

console.log(`TARGET  ${meta.properties.title}`);
console.log(`        ${sheetId}${sheetId === PRODUCTION_SHEET_ID ? '   *** PRODUCTION ***' : ''}`);
console.log(`MODE    ${write ? 'WRITE' : 'dry run'}\n`);

const existingTabs = new Set(meta.sheets.map((s) => s.properties.title));
const plan = [];
let blocked = false;

for (const tab of TABS) {
  if (only && !only.includes(tab)) continue;
  const file = path.join(dir, `${tab}.csv`);
  if (!existsSync(file)) {
    console.log(`${tab.padEnd(10)} no ${tab}.csv — skipped`);
    continue;
  }
  if (!existingTabs.has(tab)) {
    console.log(`${tab.padEnd(10)} BLOCKED: the target has no "${tab}" tab`);
    blocked = true;
    continue;
  }

  const rows = parseCsv(readFileSync(file, 'utf8'));
  const csvHeader = rows[0];
  const body = rows.slice(1);

  const live = await (await api(`/values/${encodeURIComponent(`${tab}!1:1`)}`)).json();
  const sheetHeader = live.values?.[0] ?? [];

  if (sheetHeader.length === 0) {
    console.log(`${tab.padEnd(10)} BLOCKED: the "${tab}" tab has no header row`);
    blocked = true;
    continue;
  }

  // Rebuild each row against the sheet's header, by name. Position in the CSV is
  // irrelevant; a column the sheet has and the CSV lacks is left empty, which
  // every optional field in the loader reads as its default.
  const mapping = sheetHeader.map((name) => csvHeader.indexOf(name));
  const filled = sheetHeader.filter((_, i) => mapping[i] !== -1);
  const blank = sheetHeader.filter((_, i) => mapping[i] === -1);
  const dropped = csvHeader.filter((h) => !sheetHeader.includes(h));

  // A CSV column with no home in the sheet means data this import would discard.
  // That is occasionally intended — the parser carries working columns the app
  // does not read — but never something to do silently.
  if (dropped.length && !args.includes('--drop-extra')) {
    console.log(`${tab.padEnd(10)} BLOCKED: ${dropped.length} CSV columns have no matching column in the sheet`);
    console.log(`           ${dropped.join(', ')}`);
    console.log('           Add them to the sheet, or pass --drop-extra to discard them.');
    blocked = true;
    continue;
  }

  // Never write a row whose id already exists — an import is additive, and a
  // duplicate id would give the loader two rows answering to the same key.
  const idCol = { scenarios: 'scenario_id', questions: 'question_id', rubrics: 'rubric_id' }[tab];
  let collisions = 0;
  if (idCol) {
    const idIndex = csvHeader.indexOf(idCol);
    if (idIndex === -1) {
      console.log(`${tab.padEnd(10)} BLOCKED: no "${idCol}" column in ${tab}.csv`);
      blocked = true;
      continue;
    }
    // A1 column letters, not a single character: every id column sits at index 0
    // today, but a 27th column would otherwise produce "[" and read nothing.
    const col = (() => {
      let n = idIndex;
      let s = '';
      do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return s;
    })();
    const existing = await (await api(`/values/${encodeURIComponent(`${tab}!${col}:${col}`)}`)).json();
    const known = new Set((existing.values ?? []).slice(1).map((r) => r[0]));
    collisions = body.filter((r) => known.has(r[idIndex])).length;
    if (collisions) {
      console.log(`${tab.padEnd(10)} BLOCKED: ${collisions} rows have an id already in the sheet`);
      blocked = true;
      continue;
    }
  }

  // Count across the whole width, not column A. The glossary's first column is
  // `scenario_id`, deliberately blank for French terms, so an A:A read stops at
  // the last Serbian row and under-reports the tab by nearly two thousand.
  const usedRows = (await (await api(`/values/${encodeURIComponent(`${tab}!A:Z`)}`)).json()).values?.length ?? 0;
  const values = body.map((row) => mapping.map((i) => (i === -1 ? '' : row[i] ?? '')));

  console.log(`${tab.padEnd(10)} ${String(body.length).padStart(5)} rows -> after row ${usedRows}`);
  console.log(`           ${filled.length} columns mapped by name${blank.length ? `, left blank: ${blank.join(', ')}` : ''}`);
  if (dropped.length) console.log(`           DISCARDING ${dropped.length} CSV columns: ${dropped.join(', ')}`);
  plan.push({ tab, values });
}

if (blocked) {
  console.log('\nNothing written. Resolve the blocks above.');
  process.exit(1);
}

if (!write) {
  console.log('\nDry run — pass --write to apply.');
  process.exit(0);
}

for (const { tab, values: rows } of plan) {
  // Chunked: one 3,000-row request is large enough to time out, and a partial
  // failure is easier to reason about when the boundary is visible.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows.slice(i, i + CHUNK);
    const res = await api(
      `/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values }) },
    );
    const json = await res.json();
    if (!res.ok) {
      console.error(`\n${tab}: FAILED after ${written} rows — ${json.error?.message ?? res.status}`);
      console.error('The rows written so far are in the sheet. Restore the backup, or delete them by id.');
      process.exit(1);
    }
    written += values.length;
    process.stdout.write(`\r${tab.padEnd(10)} ${written}/${rows.length}`);
  }
  console.log(`\r${tab.padEnd(10)} ${written}/${rows.length}  done`);
}

console.log('\nWritten. Content cache is 5 minutes — wait before checking the app.');
