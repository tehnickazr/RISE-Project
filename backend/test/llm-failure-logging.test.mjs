import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The failure logger must stay useful without printing the model's assessment
 * of a real student into the system log. These check both halves: that the
 * shape still identifies the classic breakages, and that nothing recognisable
 * from the student's answer survives into the line.
 */

// Captures whatever the module writes to stderr during one call.
async function logLines(response, schemaIssues = null, env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const { logFailureContextForTest } = await import('../src/llm/llm.js');
  const lines = [];
  const realError = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try {
    logFailureContextForTest('test', response, schemaIssues);
  } finally {
    console.error = realError;
    for (const k of Object.keys(env)) {
      if (k in saved) process.env[k] = saved[k];
      else delete process.env[k];
    }
  }
  return lines.join('\n');
}

const FEEDBACK = JSON.stringify({
  strengths: 'Posebno je dobro što si naveo proveru napajanja multimetrom.',
  improvements: 'Mogao bi da pomeneš bezbednosne procedure.',
  overall_score: 4.5,
  per_criterion: [{ score: 4, comment: 'Razumeš logiku dijagnostike.', competency: 'technical_knowledge' }],
  improved_answer: 'Kao tehničar mehatronike, prvo bih konsultovao dokumentaciju…',
});

const resp = (content, finishReason = 'stop') => ({
  content,
  finishReason,
  usage: { prompt_tokens: 100, completion_tokens: 200 },
});

test('a well-formed reply is described by its keys, never its prose', async () => {
  const out = await logLines(resp(FEEDBACK));
  assert.match(out, /keys=\[strengths,improvements,overall_score,per_criterion,improved_answer\]/);
  assert.doesNotMatch(out, /Posebno/);
  assert.doesNotMatch(out, /multimetrom/);
  assert.doesNotMatch(out, /tehničar/);
});

test('a markdown fence — the classic breakage — is identified as such', async () => {
  const out = await logLines(resp('```json\n' + FEEDBACK + '\n```'));
  assert.match(out, /starts=markdown-fence/);
  assert.match(out, /parse=failed/);
  assert.doesNotMatch(out, /Posebno/);
});

test('a prose preamble is identified without quoting the prose', async () => {
  const out = await logLines(resp('Evo ocene za ovog učenika: ' + FEEDBACK));
  assert.match(out, /starts=prose-or-other/);
  assert.doesNotMatch(out, /učenika/);
});

test('a truncated reply reports its finish reason and a parse failure', async () => {
  const out = await logLines(resp(FEEDBACK.slice(0, 120), 'length'));
  assert.match(out, /finish=length/);
  assert.match(out, /parse=failed/);
});

test('an empty reply is reported as empty rather than crashing', async () => {
  const out = await logLines(resp('   '));
  assert.match(out, /shape: empty/);
});

test('schema issues still reach the log — they carry field names, not answers', async () => {
  const out = await logLines(resp(FEEDBACK), 'per_criterion.0.score: expected number');
  assert.match(out, /per_criterion\.0\.score/);
});

test('raw content is printed only when explicitly opted in', async () => {
  const off = await logLines(resp(FEEDBACK));
  assert.doesNotMatch(off, /Posebno/);

  const on = await logLines(resp(FEEDBACK), null, { LLM_LOG_RAW_CONTENT: '1' });
  assert.match(on, /Posebno/);
  assert.match(on, /contains personal data/);
});
