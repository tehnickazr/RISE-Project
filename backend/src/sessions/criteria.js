// Per-criterion scores, as rows rather than as JSON.
//
// Pure logic, outside the route module for the same reason as sampler.js:
// importing a route drags in the database pool, which refuses to load without
// DATABASE_URL, and that makes the logic untestable. Nothing here touches the
// database or the network.

/** Scores outside this range are the model misbehaving, not a real assessment. */
const MIN_SCORE = 0;
const MAX_SCORE = 5;

/**
 * One row per competency, ready for `answer_criterion_scores`.
 *
 * The model returns a list and nothing stops it naming the same competency
 * twice; the table's primary key does. Collapsing here rather than leaving it
 * to ON CONFLICT keeps *which* value won a decision rather than an accident of
 * row order — the first mention is kept, matching how the JSON reads.
 *
 * Entries the table could not hold are dropped rather than coerced. A score of
 * `null` or `"four"` written as 0 would be indistinguishable from a genuine
 * zero, and a genuine zero is a real assessment that must survive.
 */
export function dedupeCriteria(perCriterion) {
  const seen = new Map();
  for (const c of perCriterion ?? []) {
    const competency = String(c?.competency ?? '').trim();
    if (!competency) continue;
    if (typeof c?.score !== 'number' || Number.isNaN(c.score)) continue;
    if (c.score < MIN_SCORE || c.score > MAX_SCORE) continue;
    if (!seen.has(competency)) seen.set(competency, c.score);
  }
  return [...seen].map(([competency, score]) => ({ competency, score }));
}
