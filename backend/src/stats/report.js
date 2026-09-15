// Assembling one statistics payload, and turning it into CSV.
//
// The queries are in ../db/stats.js and the rules in ./rules.js. This is the
// layer that runs them together, and it is the only place that knows a report
// has an activity section, a utilisation section and a progress section.
//
// Both scopes come through here. A school administrator gets exactly the same
// shape as a platform administrator, minus the cross-school breakdown — so the
// page component is one component rather than two that slowly diverge.

import {
  accounts,
  activity,
  activityBySchool,
  answerMode,
  practiceAndImprovement,
  progress,
  progressByCompetency,
  trend,
  utilisation,
} from '../db/stats.js';
import { change, previousWindow, windowFor } from './rules.js';

export async function buildReport({ orgId = null, query, now = new Date() }) {
  const win = windowFor(query, now);
  const prevWin = previousWindow(win);

  const [acts, accs, util, mode, tr, prog, comp, practice] = await Promise.all([
    activity(orgId, win),
    accounts(orgId, win),
    utilisation(orgId, win),
    answerMode(orgId, win),
    trend(orgId, win),
    progress(orgId, win),
    progressByCompetency(orgId, win),
    practiceAndImprovement(orgId),
  ]);

  // The comparison costs two more queries and is only fetched when there is
  // something to compare against — on "project to date" there is not.
  const previous = prevWin
    ? await Promise.all([activity(orgId, prevWin), utilisation(orgId, prevWin)]).then(
        ([a, u]) => ({ activity: a, utilisation: u })
      )
    : null;

  const bySchool = orgId ? null : await activityBySchool(win);

  return {
    period: {
      key: query.period,
      start: win.start ? win.start.toISOString() : null,
      end: win.end.toISOString(),
      days: win.days,
      previous_start: prevWin ? prevWin.start.toISOString() : null,
      previous_end: prevWin ? prevWin.end.toISOString() : null,
    },
    scope: orgId ? 'organization' : 'platform',
    generated_at: now.toISOString(),
    activity: {
      ...acts,
      accounts: accs,
      answers: mode,
      trend: tr,
      by_school: bySchool,
      change: previous
        ? {
            started: change(acts.started, previous.activity.started),
            completed: change(acts.completed, previous.activity.completed),
          }
        : null,
      previous: previous ? previous.activity : null,
    },
    utilisation: {
      ...util,
      previous: previous ? previous.utilisation : null,
      change: previous
        ? {
            cost_eur: change(util.cost_eur, previous.utilisation.cost_eur),
            tokens_in: change(util.tokens_in, previous.utilisation.tokens_in),
            tokens_out: change(util.tokens_out, previous.utilisation.tokens_out),
            calls: change(util.calls, previous.utilisation.calls),
            transcription_seconds: change(
              util.transcription_seconds,
              previous.utilisation.transcription_seconds
            ),
          }
        : null,
    },
    progress: { ...prog, by_competency: comp, practice },
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
//
// Semicolon-delimited with a comma decimal, because Serbia, France and Portugal
// all write 3,61 — and a comma decimal cannot coexist with a comma delimiter.
// This is the format that opens by double-click in all three partner countries.
//
// No thousands separator anywhere. France groups with a space and Portugal and
// Serbia with a dot, so there is no single correct choice; a grouped number in a
// data file is presentation smuggled into data, and spreadsheets group for
// display anyway.

const DELIM = ';';

/** A number as the three partner locales write it. Integers stay bare. */
export function num(value, dp = 2) {
  if (value === null || value === undefined) return '';
  if (Number.isInteger(value) && dp === 0) return String(value);
  return value.toFixed(dp).replace('.', ',');
}

function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(cell).join(DELIM)).join('\r\n') + '\r\n';
}

/**
 * The export, as named sheets.
 *
 * Several files rather than one, because activity, utilisation and progress
 * have genuinely different shapes and forcing them into a single table produces
 * something nobody can pivot.
 */
export function reportToCsvFiles(report, { schoolNames = {} } = {}) {
  const p = report.period;
  const files = {};

  files['01_summary.csv'] = toCsv([
    ['metric', 'value', 'unit', 'period_start', 'period_end'],
    ...[
      ['interviews_started', report.activity.started, 'count'],
      ['interviews_completed', report.activity.completed, 'count'],
      ['interviews_abandoned', report.activity.abandoned, 'count'],
      ['students_practised', report.activity.practised, 'count'],
      ['student_accounts', report.activity.accounts.student, 'count'],
      ['student_accounts_new', report.activity.accounts.new_students, 'count'],
      ['teacher_accounts', report.activity.accounts.teacher, 'count'],
      ['admin_accounts', report.activity.accounts.admin, 'count'],
      ['answers_total', report.activity.answers.answers, 'count'],
      ['answers_dictated', report.activity.answers.dictated, 'count'],
      ['model_calls', report.utilisation.llm_calls, 'count'],
      ['tokens_in', report.utilisation.tokens_in, 'tokens'],
      ['tokens_out', report.utilisation.tokens_out, 'tokens'],
      ['transcription', Math.round(report.utilisation.transcription_seconds), 'seconds'],
      ['cost_estimated', num(report.utilisation.cost_eur, 4), 'EUR'],
      ['co2e', num(report.utilisation.co2e_g, 4), 'grams'],
      ['water', num(report.utilisation.water_ml, 4), 'millilitres'],
      ['students_measurable', report.progress.total.students, 'count'],
      ['score_first_mean', num(report.progress.total.first_score), 'score_0_5'],
      ['score_latest_mean', num(report.progress.total.latest_score), 'score_0_5'],
      ['students_improved', report.progress.total.improved, 'count'],
    ].map(([k, v, u]) => [k, v, u, p.start ?? '', p.end]),
  ]);

  if (report.activity.by_school) {
    files['02_by_school.csv'] = toCsv([
      [
        'org_id',
        'school',
        'country',
        'students',
        'students_practised',
        'interviews_started',
        'interviews_completed',
      ],
      ...report.activity.by_school.map((s) => [
        s.id,
        s.name,
        s.country,
        s.students,
        s.practised,
        s.started,
        s.completed,
      ]),
    ]);
  }

  files['03_trend.csv'] = toCsv([
    ['bucket_start', 'granularity', 'interviews_started', 'interviews_completed'],
    ...report.activity.trend.buckets.map((b) => [
      new Date(b.bucket).toISOString().slice(0, 10),
      report.activity.trend.granularity,
      b.started,
      b.completed,
    ]),
  ]);

  files['04_utilisation.csv'] = toCsv([
    [
      'period',
      'model_calls',
      'tokens_in',
      'tokens_out',
      'transcription_seconds',
      'cost_eur',
      'co2e_g',
      'water_ml',
    ],
    [
      'selected',
      report.utilisation.llm_calls,
      report.utilisation.tokens_in,
      report.utilisation.tokens_out,
      Math.round(report.utilisation.transcription_seconds),
      num(report.utilisation.cost_eur, 4),
      num(report.utilisation.co2e_g, 4),
      num(report.utilisation.water_ml, 4),
    ],
    ...(report.utilisation.previous
      ? [
          [
            'previous',
            report.utilisation.previous.llm_calls,
            report.utilisation.previous.tokens_in,
            report.utilisation.previous.tokens_out,
            Math.round(report.utilisation.previous.transcription_seconds),
            num(report.utilisation.previous.cost_eur, 4),
            num(report.utilisation.previous.co2e_g, 4),
            num(report.utilisation.previous.water_ml, 4),
          ],
        ]
      : []),
  ]);

  files['05_progress.csv'] = toCsv([
    [
      'scope',
      'scope_name',
      'competency',
      'students',
      'score_first',
      'score_latest',
      'score_change',
      'improved',
      'suppressed',
      'note',
    ],
    [
      report.scope,
      'ALL',
      'overall',
      report.progress.total.students,
      num(report.progress.total.first_score),
      num(report.progress.total.latest_score),
      report.progress.total.suppressed
        ? ''
        : num(report.progress.total.latest_score - report.progress.total.first_score),
      report.progress.total.improved,
      report.progress.total.suppressed ? 'yes' : 'no',
      report.progress.total.suppressed ? 'fewer students than the reporting threshold' : '',
    ],
    ...report.progress.by_org.map((o) => [
      'school',
      schoolNames[o.org_id] ?? o.org_id,
      'overall',
      o.students,
      num(o.first_score),
      num(o.latest_score),
      o.suppressed ? '' : num(o.latest_score - o.first_score),
      o.improved,
      o.suppressed ? 'yes' : 'no',
      o.suppressed ? 'fewer students than the reporting threshold' : '',
    ]),
    ...report.progress.by_competency.map((c) => [
      report.scope,
      'ALL',
      c.competency,
      c.students,
      num(c.first_score),
      num(c.latest_score),
      c.suppressed ? '' : num(c.latest_score - c.first_score),
      '',
      c.suppressed ? 'yes' : 'no',
      c.suppressed ? 'fewer students than the reporting threshold' : '',
    ]),
  ]);

  files['00_README.txt'] = readme(report);
  return files;
}

function readme(report) {
  const p = report.period;
  return `RISE — statistics export
========================

Generated   ${report.generated_at}
Period      ${p.start ?? 'the beginning'} to ${p.end}
Scope       ${report.scope === 'platform' ? 'all organisations' : 'one organisation'}

FORMAT
  UTF-8 with byte-order mark, SEMICOLON-separated, COMMA as the decimal
  separator, dates as YYYY-MM-DD.

  This is the convention used in all three partner countries — Serbia, France
  and Portugal all write 3,61 rather than 3.61 — so these files open correctly
  by double-clicking on a machine set to any of those locales. On an
  English-locale machine, use Data > From Text/CSV and set the locale rather
  than double-clicking.

  There is no thousands separator. France groups with a space, Portugal and
  Serbia with a dot, and a grouped number inside a data file is presentation
  smuggled into data.

THINGS THAT MUST TRAVEL WITH THESE NUMBERS

  Suppression. Any group of fewer than five students is withheld rather than
  averaged, and appears as an empty value flagged suppressed=yes, never as a
  zero. These pages carry no names, but an average over two students, read by
  those students' own teacher, is not anonymous.

  The progress figures compare a student's first completed interview with
  their most recent, scored by the same model against the same rubric. The
  period selects which students are counted — those who completed an interview
  inside it — not which of their interviews are compared. This is not a
  controlled study: students who improved may be those who kept practising,
  and the model is scoring its own conversation. Quote it as a strong
  indicator, not as proof.

  Costs are the provider's list prices at the moment of each call, recorded
  then rather than reconstructed later, and exclude any free-tier allowance or
  discount. They are what the calls would cost at list, not an invoice.

  The platform holds nothing about who a student is — no data on disadvantage,
  migrant background or special educational needs. Inclusion figures, and any
  measure of confidence or satisfaction, come from the schools' own records
  and from the project surveys, not from here.
`;
}
