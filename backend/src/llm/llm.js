// LLM client — Scaleway Generative APIs (OpenAI-compatible).
//
// Deliberately named for the job rather than the vendor. The previous client
// was `together.js`, which made the vendor coupling invisible until it came
// time to swap: provider-specific workarounds accumulated in a file nobody
// read as vendor-specific. The endpoint and model live in config below; the
// rest of this file is provider-neutral.
//
// Scaleway was chosen over Together.ai for EU data residency — a Paris region
// keeps student answers inside the EU, which an Erasmus+ project needs — at
// roughly half the cost and half the latency of the previous model.

import { priceUsage } from './pricing.js';

const BASE_URL = process.env.SCW_BASE_URL || 'https://api.scaleway.ai/v1';
const CHAT_URL = `${BASE_URL}/chat/completions`;

// Node's fetch has no response timeout: a connection that opens and then goes
// quiet hangs until the process dies. The student's browser hangs with it, and
// nothing is ever logged.
//
// 45 s is deliberately generous. Measured against production Scaleway with the
// live scoring prompt, calls run 3.4–6.0 s (median 4.8 s), and a 4 000-character
// answer costs no more than a short one — length moves prompt tokens, not
// latency. So this is ~9x the median: it cannot fire on a legitimate call, which
// matters because a false positive costs a student their answer, while a real
// hang only costs them the wait. Revise it downward from the durations logged
// below, not from intuition.
const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 45000);

// The closing summary gets a shorter budget than scoring does, because the two
// failures cost the student very different things. A scoring timeout loses the
// answer they just wrote, so it should be almost impossible. A summary timeout
// costs only the closing prose: the interview is already complete and stored,
// and the text is regenerated on the next load of the session. Measured at
// 2.7–3.7 s — shorter than scoring, since it writes fewer tokens despite the
// larger prompt — so 20 s is still ~6x the median.
export const SUMMARY_TIMEOUT_MS = Number(process.env.LLM_SUMMARY_TIMEOUT_MS ?? 20000);

/** A call that exceeded its budget, as opposed to one the provider refused. */
export class LlmTimeoutError extends Error {
  constructor(ms) {
    super(`LLM call timed out after ${ms} ms`);
    this.name = 'LlmTimeoutError';
    this.timeoutMs = ms;
  }
}

function getConfig() {
  const apiKey = process.env.SCW_SECRET_KEY;
  const model = process.env.SCW_MODEL;
  // The Generative APIs authenticate with the secret key alone. SCW_ACCESS_KEY
  // and the project/organisation IDs belong to other Scaleway services and are
  // deliberately not read here, so deployments need exactly one secret.
  if (!apiKey) throw new Error('SCW_SECRET_KEY is required');
  if (!model) throw new Error('SCW_MODEL is required');
  return { apiKey, model };
}

// Lower temperature than typical chat: rubric scoring should be reproducible
// across attempts on the same answer. 0.2 is a sweet spot — still allows
// natural-language variation in the prose fields (strengths/improvements/
// improved_answer) without making per-criterion scores swing.
async function callModel(
  messages,
  { maxTokens = 1500, temperature = 0.2, timeoutMs = DEFAULT_TIMEOUT_MS, label = 'call' } = {}
) {
  const { apiKey, model } = getConfig();
  const started = Date.now();
  let res;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        // Qwen3.6 is a hybrid reasoning model. Scoring needs the answer, not the
        // deliberation: thinking tokens cost latency and money, and land in the
        // content field where they break JSON parsing. 'none' is Scaleway's
        // equivalent of the older chat_template_kwargs thinking switches.
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      // The budget covers the whole exchange, not just the connect: a provider
      // that accepts the request and then stalls mid-generation is the failure
      // this exists for.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // fetch reports an aborted signal as a TimeoutError DOMException, which
    // reads as "The operation was aborted" by the time it reaches a log line.
    // Name it here, while the budget and the elapsed time are still in scope.
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      logCall(label, model, started, { outcome: 'timeout' });
      throw new LlmTimeoutError(timeoutMs);
    }
    logCall(label, model, started, { outcome: `network: ${err?.message ?? err}` });
    throw err;
  }
  if (!res.ok) {
    const body = await res.text();
    logCall(label, model, started, { outcome: `http ${res.status}` });
    throw new Error(`Scaleway ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const finishReason = data?.choices?.[0]?.finish_reason;
  logCall(label, data.model ?? model, started, {
    outcome: 'ok',
    usage: data.usage,
    finishReason,
  });
  if (!content) throw new Error('Scaleway returned empty content');
  return { content, model: data.model, usage: data.usage, finishReason };
}

// One line per call. The service logged 20 lines in 30 days before this — all
// of them systemd — so there was no latency data at all, and the timeout above
// could never have been justified or revised from evidence. Cheap to write,
// and the only thing that makes the budget tunable later.
function logCall(label, model, started, { outcome, usage, finishReason }) {
  const ms = Date.now() - started;
  const tokens = usage
    ? ` prompt=${usage.prompt_tokens ?? '?'} completion=${usage.completion_tokens ?? '?'}`
    : '';
  const finish = finishReason ? ` finish=${finishReason}` : '';
  console.log(`[llm] ${label} ${outcome} ${ms}ms model=${model}${tokens}${finish}`);
}

function describeIssues(issues) {
  return issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
}

/**
 * A description of a malformed model response that carries no personal data.
 *
 * The model's output is an assessment of an identifiable student — their
 * strengths, what to improve, a rewrite of what they said. Printing it to
 * stderr put that in journald, which is not in the retention policy, not in the
 * Article 30 record, and would survive an erasure request. It was a store of
 * personal data nobody had accounted for.
 *
 * Almost none of it was needed to debug these failures. What diagnoses them is
 * the *shape*: whether the reply parsed, what it started with (a markdown fence
 * and a prose preamble are the two classic breakages), how long it was, and
 * which top-level keys came back. Key names are our own schema, not the
 * student's words.
 */
function describeShape(content) {
  const text = (content ?? '').trim();
  if (!text) return 'empty';

  const opener =
    text.startsWith('```') ? 'markdown-fence'
      : text.startsWith('{') ? 'object'
        : text.startsWith('[') ? 'array'
          : 'prose-or-other';

  let parse;
  try {
    const value = JSON.parse(text);
    const keys = value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value)
      : [];
    parse = `ok keys=[${keys.join(',')}]`;
  } catch (err) {
    parse = `failed (${err.message})`;
  }

  return `${content.length} chars, starts=${opener}, parse=${parse}`;
}

/** Exported for tests only — the guarantee it upholds is worth asserting. */
export { logFailureContext as logFailureContextForTest };

function logFailureContext(label, response, schemaIssues = null) {
  // stderr, so it lands in journalctl without mixing into stdout.
  console.error(
    `[llm] ${label} | finish=${response.finishReason} | usage=${JSON.stringify(response.usage)} | schemaIssues=${schemaIssues ?? 'n/a'}`
  );
  console.error(`[llm] response shape: ${describeShape(response.content)}`);

  // Escape hatch for a failure the shape cannot explain. Off unless explicitly
  // set, and never to be set on a system holding real student answers — it
  // prints the model's assessment of a real person into the system log.
  if (process.env.LLM_LOG_RAW_CONTENT === '1') {
    console.error('[llm] LLM_LOG_RAW_CONTENT is set — logging raw content, which contains personal data:');
    console.error(response.content.slice(0, 1500));
    if (response.content.length > 1500) console.error('… (truncated)');
  }
}

// The repair prompt. It lives here rather than in prompts/ because it is not
// about interviewing — it is part of the JSON contract this module enforces,
// and it only ever makes sense alongside the schema that rejected the first
// attempt.
function repairInstruction(schemaIssues) {
  return schemaIssues
    ? `Your previous JSON did not match the schema. Specific problems: ${schemaIssues}. Re-read the SCORING SCALE in the original prompt — every score MUST be between 0 and 5 inclusive. Return ONLY a corrected JSON object that satisfies the schema, with no prose before or after.`
    : 'Your previous response was not valid JSON. Return ONLY a single JSON object that matches the schema described in the original prompt, with no prose before or after.';
}

/**
 * Call the model expecting a JSON object that satisfies the given zod schema.
 * On parse / validation failure, do one repair pass where we tell the model
 * what was wrong and ask for a corrected response.
 *
 * A timeout is never retried. The repair pass exists for a model that answered
 * badly; a call that timed out may still be running and billed at the provider,
 * so retrying it would double both the student's wait and the spend for no new
 * information. The budget is per HTTP call rather than per `callLlmJson` — a
 * slow first call must not silently eat the repair's allowance — which does mean
 * a response that parses only on the second attempt can take up to twice the
 * budget in the worst case.
 */
export async function callLlmJson(messages, schema, opts = {}) {
  const label = opts.label ?? 'call';
  const first = await callModel(messages, { ...opts, label });
  const firstParse = tryParse(first.content);
  let firstSchemaIssues = null;
  if (firstParse.ok) {
    const validated = schema.safeParse(firstParse.value);
    if (validated.success) {
      return {
        data: validated.data,
        model: first.model,
        usage: first.usage,
        pricing: priceUsage(first.model, first.usage),
      };
    }
    firstSchemaIssues = describeIssues(validated.error.issues);
  }

  const repaired = await callModel(
    [
      ...messages,
      { role: 'assistant', content: first.content },
      { role: 'user', content: repairInstruction(firstSchemaIssues) },
    ],
    { ...opts, label: `${label}:repair` }
  );
  const repairedParse = tryParse(repaired.content);
  if (!repairedParse.ok) {
    logFailureContext('first response that failed parse/schema', first, firstSchemaIssues);
    logFailureContext('repaired response that ALSO failed parse', repaired);
    throw new Error(
      `LLM returned invalid JSON after repair retry (first finish=${first.finishReason}, repair finish=${repaired.finishReason})`
    );
  }
  const validated = schema.safeParse(repairedParse.value);
  if (!validated.success) {
    logFailureContext('first response that failed parse/schema', first, firstSchemaIssues);
    logFailureContext(
      'repaired response that failed schema',
      repaired,
      describeIssues(validated.error.issues)
    );
    throw new Error(
      `LLM JSON failed schema after repair: ${describeIssues(validated.error.issues)}`
    );
  }
  // A repair pass is real spend. Price the summed usage so a call that needed
  // two round trips is not recorded as costing one.
  const model = repaired.model ?? first.model;
  const usage = sumUsage(first.usage, repaired.usage);
  return { data: validated.data, model, usage, pricing: priceUsage(model, usage) };
}

function sumUsage(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return {
    prompt_tokens: (a.prompt_tokens ?? 0) + (b.prompt_tokens ?? 0),
    completion_tokens: (a.completion_tokens ?? 0) + (b.completion_tokens ?? 0),
    total_tokens: (a.total_tokens ?? 0) + (b.total_tokens ?? 0),
  };
}

function tryParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
