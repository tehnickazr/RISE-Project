import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

// The client reads its credentials at call time, not at import time, so these
// only need to exist. Nothing here reaches the network: every test replaces
// global fetch.
process.env.SCW_SECRET_KEY = 'test-key';
process.env.SCW_MODEL = 'test-model';

const { callLlmJson, LlmTimeoutError } = await import('../src/llm/llm.js');

const Schema = z.object({ ok: z.boolean() });
const messages = [{ role: 'user', content: 'hello' }];

/** A fetch that resolves with the given JSON body, after `delayMs`. */
function respondingFetch(body, delayMs = 0) {
  return async (_url, init) => {
    await sleepOrAbort(delayMs, init?.signal);
    return {
      ok: true,
      json: async () => ({
        model: 'test-model',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        choices: [{ message: { content: JSON.stringify(body) }, finish_reason: 'stop' }],
      }),
    };
  };
}

/**
 * Honour the abort signal the way undici does — reject with a TimeoutError
 * rather than resolving late. A stub that ignores the signal would let a
 * broken implementation pass.
 */
function sleepOrAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
      return;
    }
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    });
  });
}

function withFetch(stub, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = original;
    });
}

// Keep the runs quiet: every call logs a line by design.
function muted(fn) {
  const original = console.log;
  console.log = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    });
}

test('a call that never responds rejects once the budget expires', async () => {
  await muted(() =>
    withFetch(respondingFetch({ ok: true }, 60_000), async () => {
      const started = Date.now();
      await assert.rejects(
        () => callLlmJson(messages, Schema, { timeoutMs: 150 }),
        (err) => err instanceof LlmTimeoutError && err.timeoutMs === 150
      );
      // Comfortably inside the 60 s the stub would otherwise have taken.
      assert.ok(Date.now() - started < 2000, 'did not abort near the budget');
    })
  );
});

test('the timeout error names the budget rather than the abort', async () => {
  await muted(() =>
    withFetch(respondingFetch({ ok: true }, 60_000), async () => {
      const err = await callLlmJson(messages, Schema, { timeoutMs: 100 }).catch((e) => e);
      assert.match(err.message, /timed out after 100 ms/);
      assert.doesNotMatch(err.message, /operation was aborted/);
    })
  );
});

test('a response inside the budget is unaffected', async () => {
  await muted(() =>
    withFetch(respondingFetch({ ok: true }, 20), async () => {
      const { data } = await callLlmJson(messages, Schema, { timeoutMs: 2000 });
      assert.deepEqual(data, { ok: true });
    })
  );
});

test('a timeout is not retried — one attempt, not two', async () => {
  let calls = 0;
  await muted(() =>
    withFetch(
      async (url, init) => {
        calls += 1;
        return respondingFetch({ ok: true }, 60_000)(url, init);
      },
      async () => {
        await assert.rejects(() => callLlmJson(messages, Schema, { timeoutMs: 100 }));
        assert.equal(calls, 1, 'a timed-out call was retried');
      }
    )
  );
});

test('the repair pass gets its own budget rather than the remainder', async () => {
  // First response is valid JSON but fails the schema, which triggers a repair.
  // Both calls take most of a budget; under a single shared deadline the second
  // would be aborted, so completing proves the budget is per call.
  let calls = 0;
  const stub = async (_url, init) => {
    calls += 1;
    const body = calls === 1 ? { nope: true } : { ok: true };
    await sleepOrAbort(120, init?.signal);
    return {
      ok: true,
      json: async () => ({
        model: 'test-model',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        choices: [{ message: { content: JSON.stringify(body) }, finish_reason: 'stop' }],
      }),
    };
  };
  await muted(() =>
    withFetch(stub, async () => {
      const { data } = await callLlmJson(messages, Schema, { timeoutMs: 200 });
      assert.deepEqual(data, { ok: true });
      assert.equal(calls, 2);
    })
  );
});

test('a provider error is not reported as a timeout', async () => {
  const stub = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
  await muted(() =>
    withFetch(stub, async () => {
      const err = await callLlmJson(messages, Schema, { timeoutMs: 2000 }).catch((e) => e);
      assert.ok(!(err instanceof LlmTimeoutError));
      assert.match(err.message, /429/);
    })
  );
});
