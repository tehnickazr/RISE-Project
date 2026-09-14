import { JWT } from 'google-auth-library';
import { z } from 'zod';

const ScenarioRow = z.object({
  scenario_id: z.string().min(1),
  profession: z.string().min(1),
  title_sr: z.string(),
  title_en: z.string(),
  title_fr: z.string().optional().default(''),
  title_pt: z.string().optional().default(''),
  description_sr: z.string(),
  description_en: z.string(),
  description_fr: z.string().optional().default(''),
  description_pt: z.string().optional().default(''),
  language: z.string(),
  difficulty: z.string(),
  // Added with the French/Portuguese content. Optional so existing rows keep loading.
  sector: z.string().optional().default(''),
  eqf_level: z.string().optional().default(''),
  // Empty cells arrive as '' — treat those as "not set" rather than 0.
  question_count: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  // Retiring content, without deleting it. A partner replacing a trade's
  // questions must not be able to remove the rows an existing interview was
  // taken against — the session would stop opening. Setting this to FALSE takes
  // the scenario out of circulation while leaving every past interview readable.
  //
  // Absent or empty means active, so every row written before this column
  // existed keeps working untouched.
  active: z.preprocess(normalizeActive, z.boolean().default(true)),
});

/** Spreadsheets say "no" in a lot of ways; only an explicit negative retires. */
const RETIRED_VALUES = new Set([
  'false', 'no', 'n', '0', 'off', 'retired', 'inactive', 'archived',
  'ne', 'non', 'nao', 'não',
]);

export function normalizeActive(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  return !RETIRED_VALUES.has(String(value).trim().toLowerCase());
}

const QuestionRow = z.object({
  question_id: z.string().min(1),
  scenario_id: z.string().min(1),
  order: z.coerce.number().int().positive(),
  question_sr: z.string(),
  question_en: z.string(),
  question_fr: z.string().optional().default(''),
  question_pt: z.string().optional().default(''),
  type: z.string(),
  competency: z.string(),
  // Added with the French/Portuguese content. Optional so existing rows keep loading.
  expected_answer: z.string().optional().default(''),
  eqf_level: z.string().optional().default(''),
  type_source: z.string().optional().default(''),
});

const RubricRow = z.object({
  rubric_id: z.string().min(1),
  scenario_id: z.string().min(1),
  competency: z.string().min(1),
  label_sr: z.string(),
  label_en: z.string(),
  label_fr: z.string().optional().default(''),
  label_pt: z.string().optional().default(''),
  description_sr: z.string(),
  description_en: z.string(),
  description_fr: z.string().optional().default(''),
  description_pt: z.string().optional().default(''),
  weight: z.coerce.number().min(0).max(1),
});

let _auth = null;
function getAuth() {
  if (_auth) return _auth;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error('Google service account env not configured');
  }
  // The private key may be stored with literal \n escapes; normalize either way.
  const key = rawKey.replace(/\\n/g, '\n');
  _auth = new JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return _auth;
}

async function fetchSheetValuesOnce(sheetId, range, token, timeoutMs) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?alt=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Sheets API ${res.status} for ${range}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    return json.values ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a tab's values with a short timeout and a couple of retries on
 *  transient 5xx errors (Google's Sheets API occasionally returns 503/500
 *  for a few seconds, especially right after structural sheet changes). */
async function fetchSheetValues(sheetId, range) {
  const auth = getAuth();
  const tokenResponse = await auth.getAccessToken();
  const token = tokenResponse?.token ?? tokenResponse;

  const timeoutMs = 10_000;
  const attempts = 3;
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchSheetValuesOnce(sheetId, range, token, timeoutMs);
    } catch (err) {
      lastErr = err;
      // Retry only on 5xx, abort/timeout, or generic network errors —
      // 4xx is a code/config bug, no point retrying.
      const transient =
        err.name === 'AbortError' ||
        (err.status && err.status >= 500) ||
        !err.status;
      if (!transient || i === attempts - 1) break;
      // Backoff: 500ms, 1500ms
      await new Promise((r) => setTimeout(r, 500 * (i * 2 + 1)));
    }
  }
  throw lastErr;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const [header, ...data] = rows;
  return data.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? '']))
  );
}

function parseRows(schema, rows, label) {
  const out = [];
  rows.forEach((row, i) => {
    const result = schema.safeParse(row);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        `${label} row ${i + 2} invalid: ${issue.path.join('.')} — ${issue.message}`
      );
    }
    out.push(result.data);
  });
  return out;
}

// Content is read on every scenario list, session start and answer submission.
// With ~1 500 questions that is a large payload to re-fetch each time, so cache
// it per spreadsheet. Keyed by sheet id so per-organisation sheets work unchanged.
const CACHE_TTL_MS = Number(process.env.SHEET_CACHE_TTL_MS ?? 5 * 60 * 1000);
const _cache = new Map(); // sheetId -> { data, expiresAt }
const _inFlight = new Map(); // sheetId -> Promise — collapses concurrent misses

async function fetchAndParse(sheetId) {
  const [scenariosRows, questionsRows, rubricsRows] = await Promise.all([
    fetchSheetValues(sheetId, 'scenarios'),
    fetchSheetValues(sheetId, 'questions'),
    fetchSheetValues(sheetId, 'rubrics'),
  ]);

  return {
    scenarios: parseRows(ScenarioRow, rowsToObjects(scenariosRows), 'scenarios'),
    questions: parseRows(QuestionRow, rowsToObjects(questionsRows), 'questions'),
    rubrics: parseRows(RubricRow, rowsToObjects(rubricsRows), 'rubrics'),
  };
}

/**
 * Content for one spreadsheet.
 *
 * The id is a parameter because each organization now has its own sheet; the
 * environment variable remains only as a fallback for the maintenance scripts,
 * which operate on one sheet named on the command line and have no
 * organization to ask.
 */
export async function loadSheetContent(sheetIdArg) {
  const sheetId = sheetIdArg ?? process.env.GOOGLE_SPREADSHEET_ID;
  if (!sheetId) throw new Error('no content spreadsheet configured');

  if (CACHE_TTL_MS > 0) {
    const hit = _cache.get(sheetId);
    if (hit && hit.expiresAt > Date.now()) return hit.data;

    // A burst of requests must not all fetch — share one in-flight promise.
    const pending = _inFlight.get(sheetId);
    if (pending) return pending;
  }

  const promise = fetchAndParse(sheetId)
    .then((data) => {
      if (CACHE_TTL_MS > 0) {
        _cache.set(sheetId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      return data;
    })
    .finally(() => _inFlight.delete(sheetId));

  if (CACHE_TTL_MS > 0) _inFlight.set(sheetId, promise);
  return promise;
}

/** Drop cached content. Omit sheetId to clear every sheet. */
export function invalidateSheetCache(sheetId) {
  if (sheetId) _cache.delete(sheetId);
  else _cache.clear();
}

/**
 * Scenarios on offer. Retired ones are withheld by default — they must not
 * appear anywhere a student or teacher picks from — but callers that need the
 * whole set (a future content-admin view) can ask for it.
 */
export async function loadScenarios({ includeRetired = false, sheetId } = {}) {
  const { scenarios } = await loadSheetContent(sheetId);
  return selectActive(scenarios, includeRetired);
}

/** Split out so the rule can be tested without reaching the Sheets API. */
export function selectActive(scenarios, includeRetired = false) {
  return includeRetired ? scenarios : scenarios.filter((s) => s.active !== false);
}

/**
 * One scenario, retired or not.
 *
 * Deliberately unfiltered: this is what session replay resolves against, so a
 * retired scenario must still load or every interview taken on it would 404.
 * Callers that decide whether something may be *started* check `active`
 * themselves — see the guard in POST /api/sessions.
 */
export async function loadScenarioById(id, sheetId) {
  const { scenarios, questions, rubrics } = await loadSheetContent(sheetId);
  const scenario = scenarios.find((s) => s.scenario_id === id);
  if (!scenario) return null;
  return {
    ...scenario,
    questions: questions
      .filter((q) => q.scenario_id === id)
      .sort((a, b) => a.order - b.order),
    rubrics: rubrics.filter((r) => r.scenario_id === id),
  };
}
