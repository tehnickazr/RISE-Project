#!/usr/bin/env node
//
// Dry-run a content import before it touches the live spreadsheet.
//
//   node --env-file=.env scripts/validate-content-import.mjs ../documents/french_kit2/import
//
// The sheet is the production content store and there is no undo beyond a
// backup copy, so every check the running platform would apply is applied here
// first, against the CSVs, while a mistake is still free to fix.
//
// Read-only. It never writes to the sheet.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { JWT } from 'google-auth-library';
import { loadSheetContent } from '../src/sheets/loader.js';
import { TYPE_QUOTA, DEFAULT_SESSION_LENGTH } from '../src/sessions/sampler.js';

// TYPE_QUOTA is an array of [type, ceiling] pairs, not an object.
const QUOTA = new Map(TYPE_QUOTA);

const dir = process.argv[2];
if (!dir) {
  console.error('usage: validate-content-import.mjs <directory with scenarios/questions/rubrics.csv>');
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

function readTable(name) {
  const file = path.join(dir, `${name}.csv`);
  if (!existsSync(file)) {
    console.error(`missing ${file}`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const header = rows[0];
  return {
    header,
    rows: rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))),
  };
}

const problems = [];
const warnings = [];
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

const scenarios = readTable('scenarios');
const questions = readTable('questions');
const rubrics = readTable('rubrics');

console.log('IMPORT SET');
console.log(`  scenarios ${scenarios.rows.length}`);
console.log(`  questions ${questions.rows.length}`);
console.log(`  rubrics   ${rubrics.rows.length}`);

// ---------------------------------------------------------------- 1. headers
//
// Two separate risks. The loader matches header names verbatim — no trimming,
// no lowercasing — so a stray space silently blanks a whole column instead of
// erroring. And the import is done by pasting, which lands values by POSITION:
// a CSV whose columns are in a different order from the sheet's writes every
// value into the wrong field while looking perfectly fine in the CSV. So the
// live header row is fetched raw and compared in order, not as a set.
const auth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const tokenResponse = await auth.getAccessToken();
const token = tokenResponse?.token ?? tokenResponse;

async function liveHeaderRow(tab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SPREADSHEET_ID}/values/${encodeURIComponent(`${tab}!1:1`)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets API ${res.status} reading ${tab} header`);
  return (await res.json()).values?.[0] ?? [];
}

const live = await loadSheetContent();

console.log('\nHEADERS vs the live sheet (order matters — you paste by position)');
for (const [name, table] of [['scenarios', scenarios], ['questions', questions], ['rubrics', rubrics]]) {
  const csvCols = table.header;
  const sheetCols = await liveHeaderRow(name);
  const untrimmed = csvCols.filter((h) => h !== h.trim());
  if (untrimmed.length) fail(`${name}: CSV header has leading/trailing space: ${JSON.stringify(untrimmed)}`);

  // The CSV may legitimately be shorter: trailing sheet columns it does not
  // write (e.g. `active`) simply stay blank, which the loader reads as a
  // default. What must hold is that the columns it does write line up.
  const overlap = Math.min(csvCols.length, sheetCols.length);
  const misplaced = [];
  for (let i = 0; i < overlap; i++) {
    if (csvCols[i] !== sheetCols[i]) misplaced.push(`col ${i + 1}: CSV "${csvCols[i]}" vs sheet "${sheetCols[i]}"`);
  }
  const trailing = sheetCols.slice(csvCols.length);
  console.log(`  ${name}: CSV ${csvCols.length} columns, sheet ${sheetCols.length}`);
  if (misplaced.length) {
    fail(`${name}: column order does not match the sheet — pasting would write values into the wrong fields:\n      ${misplaced.join('\n      ')}`);
  } else {
    console.log(`    first ${overlap} columns align`);
  }
  if (trailing.length) console.log(`    sheet columns left blank by the paste: ${trailing.join(', ')}`);
  if (csvCols.length > sheetCols.length) {
    fail(`${name}: CSV has ${csvCols.length - sheetCols.length} more columns than the sheet — the overflow would spill past the last column`);
  }
}

// ------------------------------------------------------- 3. id collisions
console.log('\nCOLLISIONS with the live sheet');
const liveScenarioIds = new Set(live.scenarios.map((s) => s.scenario_id));
const liveQuestionIds = new Set(live.questions.map((q) => q.question_id));
const liveRubricIds = new Set(live.rubrics.map((r) => r.rubric_id));

const dupScenario = scenarios.rows.filter((s) => liveScenarioIds.has(s.scenario_id));
const dupQuestion = questions.rows.filter((q) => liveQuestionIds.has(q.question_id));
const dupRubric = rubrics.rows.filter((r) => liveRubricIds.has(r.rubric_id));
console.log(`  live: ${liveScenarioIds.size} scenarios, ${liveQuestionIds.size} questions, ${liveRubricIds.size} rubrics`);
if (dupScenario.length) fail(`scenario_id already in the sheet: ${dupScenario.map((s) => s.scenario_id).join(', ')}`);
if (dupQuestion.length) fail(`question_id already in the sheet (${dupQuestion.length}), e.g. ${dupQuestion.slice(0, 5).map((q) => q.question_id).join(', ')}`);
if (dupRubric.length) fail(`rubric_id already in the sheet (${dupRubric.length}), e.g. ${dupRubric.slice(0, 5).map((r) => r.rubric_id).join(', ')}`);
if (!dupScenario.length && !dupQuestion.length && !dupRubric.length) console.log('  none');

// --------------------------------------------------- 4. ids unique within set
for (const [name, rows, key] of [
  ['scenarios', scenarios.rows, 'scenario_id'],
  ['questions', questions.rows, 'question_id'],
  ['rubrics', rubrics.rows, 'rubric_id'],
]) {
  const seen = new Set();
  const dup = new Set();
  for (const r of rows) {
    if (seen.has(r[key])) dup.add(r[key]);
    seen.add(r[key]);
  }
  if (dup.size) fail(`${name}: duplicate ${key} within the import: ${[...dup].slice(0, 5).join(', ')}`);
}

// ------------------------------------------------------ 5. referential integrity
console.log('\nREFERENTIAL INTEGRITY');
const newIds = new Set(scenarios.rows.map((s) => s.scenario_id));
const orphanQ = questions.rows.filter((q) => !newIds.has(q.scenario_id));
const orphanR = rubrics.rows.filter((r) => !newIds.has(r.scenario_id));
const noQuestions = scenarios.rows.filter((s) => !questions.rows.some((q) => q.scenario_id === s.scenario_id));
const noRubric = scenarios.rows.filter((s) => !rubrics.rows.some((r) => r.scenario_id === s.scenario_id));
if (orphanQ.length) fail(`${orphanQ.length} questions point at a scenario not in the import`);
if (orphanR.length) fail(`${orphanR.length} rubrics point at a scenario not in the import`);
if (noQuestions.length) fail(`${noQuestions.length} scenarios have no questions: ${noQuestions.slice(0, 5).map((s) => s.scenario_id).join(', ')}`);
if (noRubric.length) fail(`${noRubric.length} scenarios have no rubric: ${noRubric.slice(0, 5).map((s) => s.scenario_id).join(', ')}`);
if (!orphanQ.length && !orphanR.length && !noQuestions.length && !noRubric.length) console.log('  clean');

// ------------------------------------------------------------ 6. rubric weights
console.log('\nRUBRIC WEIGHTS');
const byScenario = new Map();
for (const r of rubrics.rows) {
  if (!byScenario.has(r.scenario_id)) byScenario.set(r.scenario_id, []);
  byScenario.get(r.scenario_id).push(r);
}
let offSum = 0;
for (const [sid, list] of byScenario) {
  const sum = list.reduce((a, r) => a + Number(r.weight), 0);
  if (Math.abs(sum - 1) > 0.005) {
    offSum++;
    if (offSum <= 5) fail(`${sid}: weights sum to ${sum.toFixed(3)}, not 1.00`);
  }
}
console.log(offSum === 0 ? `  all ${byScenario.size} scenarios sum to 1.00` : `  ${offSum} scenarios off`);

// -------------------------------------------------- 7. vocabularies the app uses
console.log('\nVOCABULARY');
const KNOWN_TYPES = new Set(QUOTA.keys());
const KNOWN_COMPETENCIES = new Set([
  'technical_knowledge', 'resilience', 'ethics', 'time_management', 'authenticity',
]);
const badTypes = new Map();
for (const q of questions.rows) {
  if (!KNOWN_TYPES.has(q.type)) badTypes.set(q.type, (badTypes.get(q.type) ?? 0) + 1);
}
if (badTypes.size) fail(`question types the sampler does not know: ${[...badTypes].map(([t, n]) => `${t} (${n})`).join(', ')}`);
else console.log(`  types: all within ${[...KNOWN_TYPES].join(', ')}`);

const badComp = new Map();
for (const r of [...questions.rows, ...rubrics.rows]) {
  const c = r.competency;
  if (c && !KNOWN_COMPETENCIES.has(c)) badComp.set(c, (badComp.get(c) ?? 0) + 1);
}
if (badComp.size) fail(`competencies not in the rubric set: ${[...badComp].map(([c, n]) => `${c} (${n})`).join(', ')}`);
else console.log('  competencies: all within the five criteria');

// ------------------------------------------- 8. can each scenario fill a session
//
// The sampler draws to TYPE_QUOTA and tops up from whatever is left. A scenario
// with fewer than DEFAULT_SESSION_LENGTH questions serves a short interview —
// legal, but worth knowing before a student meets it.
console.log('\nSESSION SUPPLY');
const perScenario = new Map();
for (const q of questions.rows) {
  if (!perScenario.has(q.scenario_id)) perScenario.set(q.scenario_id, []);
  perScenario.get(q.scenario_id).push(q);
}
const counts = [...perScenario.values()].map((l) => l.length).sort((a, b) => a - b);
const short = [...perScenario.entries()].filter(([, l]) => l.length < DEFAULT_SESSION_LENGTH);
console.log(`  questions per scenario: min ${counts[0]}, median ${counts[Math.floor(counts.length / 2)]}, max ${counts[counts.length - 1]}`);
if (short.length) warn(`${short.length} scenarios have fewer than ${DEFAULT_SESSION_LENGTH} questions: ${short.slice(0, 6).map(([s, l]) => `${s} (${l.length})`).join(', ')}`);

// A scenario that cannot meet a type's quota is not an error — the sampler tops
// up — but a bank with no technical questions at all makes a strange interview.
const missingType = [];
for (const [sid, list] of perScenario) {
  const have = new Set(list.map((q) => q.type));
  const absent = [...KNOWN_TYPES].filter((t) => QUOTA.get(t) > 0 && !have.has(t));
  if (absent.length >= 3) missingType.push(`${sid} (${absent.join(', ')})`);
}
if (missingType.length) warn(`${missingType.length} scenarios missing 3+ question types: ${missingType.slice(0, 5).join('; ')}`);

// ------------------------------------------------------------- 9. expected answers
const noAnchor = questions.rows.filter((q) => !(q.expected_answer ?? '').trim());
console.log(`\nEXPECTED ANSWERS\n  ${questions.rows.length - noAnchor.length} of ${questions.rows.length} questions have one`);
if (noAnchor.length) warn(`${noAnchor.length} questions have no expected answer — the model scores against it`);

// ------------------------------------------------------------------- verdict
console.log('\n' + '='.repeat(60));
if (warnings.length) {
  console.log(`WARNINGS (${warnings.length})`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}
if (problems.length) {
  console.log(`\nBLOCKERS (${problems.length})`);
  problems.forEach((p) => console.log(`  - ${p}`));
  console.log('\nDo not import until these are resolved.');
  process.exit(1);
}
console.log('\nNo blockers. Safe to paste into the sheet.');
