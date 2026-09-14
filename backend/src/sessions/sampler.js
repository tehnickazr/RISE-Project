// Question selection.
//
// Pure logic, deliberately outside the route module: importing a route drags in
// the database pool, which refuses to load without DATABASE_URL, and that made
// the sampler untestable. Nothing here touches the database or the network.

export const DEFAULT_SESSION_LENGTH = Number(process.env.SESSION_QUESTION_COUNT ?? 10);

// Minimum shape of a 10-question interview — a ceiling per type, not a target.
// Banks vary a lot: Portuguese scenarios run ~20 technical of 30 and most carry
// no `trap` at all. Quotas guarantee the rarer types appear when they exist;
// whatever is left is backfilled from the remainder, which is deliberately
// proportional — a welding interview should read as mostly technical.
export const TYPE_QUOTA = [
  ['general', 1],
  ['technical', 4],
  ['situational', 2],
  ['behavioral', 2],
  ['trap', 1],
];

const QUOTA_TOTAL = TYPE_QUOTA.reduce((n, [, want]) => n + want, 0);

/**
 * The quota, scaled to a shorter interview.
 *
 * The quota above sums to ten, and the selection used to fill all ten and then
 * slice to the requested length. For a full interview those are the same thing.
 * For a shorter one they are not: the slice takes the list in quota order, so a
 * five-question interview came out as the opener plus four technical questions
 * and no situational, behavioural or trap question at all. That length is the
 * per-student override, i.e. the accommodation offered to SEN students — so the
 * bug assessed exactly those students on a narrower set of competencies than
 * their classmates, which is the opposite of what the override is for.
 *
 * One seat per type first, in quota order, because breadth is the point of
 * having quotas; only what is left over is shared out proportionally, so a
 * seven-question interview still reads as mostly technical.
 *
 * At the full length this returns TYPE_QUOTA itself. That is deliberate rather
 * than incidental: every interview taken so far was drawn at ten, and a rounding
 * rule that shifted even one seat would silently make new sessions
 * incomparable with the ones already scored.
 */
export function quotaFor(target) {
  if (target >= QUOTA_TOTAL) return TYPE_QUOTA;

  const seats = TYPE_QUOTA.map(([type]) => [type, 0]);
  let left = target;

  for (const seat of seats) {
    if (left === 0) break;
    seat[1] = 1;
    left -= 1;
  }

  if (left > 0) {
    // Largest remainder, ties broken by quota order, so the seats always sum to
    // exactly `left` rather than to whatever rounding produces.
    const shares = TYPE_QUOTA.map(([, want], i) => {
      const exact = (want / QUOTA_TOTAL) * left;
      const whole = Math.floor(exact);
      return { i, whole, rest: exact - whole };
    });
    let assigned = 0;
    for (const s of shares) {
      seats[s.i][1] += s.whole;
      assigned += s.whole;
    }
    for (const s of [...shares].sort((a, b) => b.rest - a.rest || a.i - b.i)) {
      if (assigned >= left) break;
      seats[s.i][1] += 1;
      assigned += 1;
    }
  }

  return seats;
}

/** Deterministic PRNG so a resumed session always sees the same questions. */
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function next() {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rand) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick the questions for one session.
 *
 * Portuguese scenarios carry 30 questions and are ordered by type — general
 * first, behavioural and ethics last — so taking the first N would drop entire
 * categories outright (measured: the first 10 of every PT bank contain zero
 * behavioural, situational or ethics questions).
 *
 * Sampling per type fixes that, and seeding by attempt means a second sitting
 * draws a different set. Note the draws are not independent: where a bank holds
 * only one behavioural question, every attempt necessarily picks it, so expect
 * partial overlap between attempts rather than none.
 */
export function selectQuestions(scenario, session) {
  const all = (scenario.questions ?? []).slice().sort((a, b) => a.order - b.order);
  const target = scenario.question_count ?? DEFAULT_SESSION_LENGTH;
  if (all.length <= target) return all;

  const seed = `${session?.student_id ?? ''}:${scenario.scenario_id}:${session?.attempt_number ?? 1}`;
  const rand = seededRandom(seed);

  const picked = [];
  const taken = new Set();

  // A real interview opens on the candidate, not on trade knowledge. Every
  // partner writes a self-presentation question at the top of the bank, but the
  // quota drew its one `general` at random from the whole general pool, so in a
  // bank with three of them the opener was usually left out and the session
  // began on whichever pick happened to have the lowest order — a mechatronics
  // interview opening on "which indicators do you track?". Pinning the
  // lowest-order general question makes the opener certain and costs nothing:
  // it is spent out of the same quota, not added to it.
  const opener = all.find((q) => q.type === 'general') ?? null;
  if (opener) {
    picked.push(opener);
    taken.add(opener.question_id);
  }

  const pools = new Map();
  for (const q of all) {
    if (taken.has(q.question_id)) continue;
    if (!pools.has(q.type)) pools.set(q.type, []);
    pools.get(q.type).push(q);
  }
  for (const [type, list] of pools) pools.set(type, shuffled(list, rand));

  for (const [type, want] of quotaFor(target)) {
    const pool = pools.get(type) ?? [];
    const remaining = type === opener?.type ? want - 1 : want;
    for (const q of pool.slice(0, Math.max(0, remaining))) {
      picked.push(q);
      taken.add(q.question_id);
    }
  }

  // Backfill to target from whatever is left, so a missing type costs nothing.
  if (picked.length < target) {
    for (const q of shuffled(all.filter((x) => !taken.has(x.question_id)), rand)) {
      if (picked.length >= target) break;
      picked.push(q);
      taken.add(q.question_id);
    }
  }

  // The opener leads, then everything else in bank order. Sorting the whole set
  // by `order` would undo the pinning wherever the self-presentation question is
  // not also the lowest-numbered one — which is exactly the case in the banks
  // where the opener had to be carried in from another level.
  const chosen = picked.slice(0, target);
  const rest = chosen.filter((q) => q !== opener).sort((a, b) => a.order - b.order);
  return opener ? [opener, ...rest] : rest;
}
