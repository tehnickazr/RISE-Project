#!/usr/bin/env node
//
// Refresh the Scaleway price / environmental-impact table.
//
// Scaleway publishes a machine-readable product catalog, so rates never need
// to be scraped or transcribed by hand. This script pulls it and writes
// backend/pricing/scaleway.json, which is committed.
//
// The application reads that file, never this API: pricing must not be a
// network dependency inside an interview request, where an outage would turn
// a student's answer into an error. Refreshing is a deliberate act that
// produces a reviewable diff.
//
//   node scripts/refresh-pricing.js
//
// Re-run when Scaleway changes prices or the model changes. The committed file
// is the audit trail for what rate was applied when — which matters here
// because the open-source release starts from a fresh repository with no git
// history to appeal to.

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../pricing');
const OUT_FILE = path.join(OUT_DIR, 'scaleway.json');
const CATALOG = 'https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products';
const PREFIX = '/ai/generative_apis/consumption/';

async function fetchCatalog() {
  const products = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`${CATALOG}?page_size=100&page=${page}`);
    if (!res.ok) throw new Error(`catalog ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const batch = (await res.json()).products ?? [];
    products.push(...batch);
    if (batch.length < 100) break;
  }
  return products;
}

// Prices arrive as exact integers (units + nanos) rather than a float, so the
// stored rate is the published rate with no parsing loss.
function toEur(price) {
  const p = price?.retail_price;
  if (!p) return null;
  return p.units + p.nanos / 1e9;
}

function build(products) {
  const models = {};
  for (const p of products) {
    if (!p.sku?.startsWith(PREFIX)) continue;
    const gen = p.properties?.generative_apis;
    // Batch pricing is half of realtime, but interviews are interactive and
    // cannot use it. Recording only what we actually pay avoids a table where
    // the wrong column is one typo away.
    if (!gen || gen.consumption_mode !== 'realtime') continue;

    const eurPer1k = toEur(p.price);
    if (eurPer1k == null) continue;
    const unit = p.unit_of_measure?.size ?? 1000;
    const env = p.environmental_impact_estimation ?? {};

    const entry = (models[p.product] ??= { region: p.locality?.region ?? null });
    const side = gen.token_type === 'input_token' ? 'input' : 'output';
    entry[side] = {
      eur_per_token: eurPer1k / unit,
      // Published per the same unit as the price. Converted to readable units
      // at write time: grams of CO2e and litres of water.
      g_co2e_per_token: (env.kg_co2_equivalent ?? 0) * 1000 / unit,
      l_water_per_token: (env.m3_water_usage ?? 0) * 1000 / unit,
    };
  }
  return models;
}

/**
 * Models billed by how much audio they were given, not by tokens.
 *
 * Whisper is `token_type: 'input_duration'` with a unit of 60 seconds, so it
 * has no output side and is dropped by the `m.input && m.output` filter that
 * guards the table above. It needs its own section rather than a loosened
 * filter — a half-populated row in `models` would price chat calls at an audio
 * rate the first time someone forgot which section they were reading.
 *
 * Impact figures are carried through as **null when the catalog omits the
 * field**, and only as a number when the catalog states one. The distinction is
 * the whole point: as of the 2026-09-03 catalog, whisper-large-v3 publishes
 * `kg_co2_equivalent: 0` and no water figure at all. A stored zero for water
 * would read as "measured, none used", which is a claim Scaleway has not made
 * and we would be inventing.
 */
function buildAudio(products) {
  const audio = {};
  for (const p of products) {
    if (!p.sku?.startsWith(PREFIX)) continue;
    const gen = p.properties?.generative_apis;
    if (!gen || gen.consumption_mode !== 'realtime') continue;
    if (gen.token_type !== 'input_duration') continue;

    const eurPerUnit = toEur(p.price);
    if (eurPerUnit == null) continue;
    // Catalogued as seconds with size 60; read it rather than assume it, so a
    // change of unit at Scaleway becomes a diff and not a 60x error.
    const seconds = p.unit_of_measure?.size ?? 60;
    const env = p.environmental_impact_estimation ?? {};

    audio[p.product] = {
      region: p.locality?.region ?? null,
      eur_per_second: eurPerUnit / seconds,
      g_co2e_per_second:
        env.kg_co2_equivalent == null ? null : (env.kg_co2_equivalent * 1000) / seconds,
      l_water_per_second:
        env.m3_water_usage == null ? null : (env.m3_water_usage * 1000) / seconds,
      supported_apis: gen.supported_apis ?? [],
    };
  }
  return audio;
}

const products = await fetchCatalog();
const models = build(products);
const complete = Object.fromEntries(
  Object.entries(models).filter(([, m]) => m.input && m.output)
);
const audio = buildAudio(products);

if (Object.keys(complete).length === 0) {
  throw new Error('catalog returned no complete generative-API models — refusing to write');
}

const now = new Date();
const table = {
  version: `scaleway-${now.toISOString().slice(0, 10)}`,
  fetched_at: now.toISOString(),
  source: CATALOG,
  currency: 'EUR',
  note: 'Retail list prices. Excludes free-tier allowance and any committed-use discount, so figures derived from this table are estimates, not billed amounts.',
  impact_note:
    'Environmental figures are Scaleway\'s own published estimates. A null means the catalog carries no figure for that model — it is not a measurement of zero. Scaleway currently publishes no water figure for audio models, and reports their CO2e as 0.',
  models: complete,
  audio,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(table, null, 2)}\n`);

console.log(`Wrote ${OUT_FILE}`);
console.log(`  version : ${table.version}`);
console.log(`  models  : ${Object.keys(complete).length}`);
for (const [name, m] of Object.entries(complete).sort()) {
  console.log(
    `    ${name.padEnd(28)} in ${(m.input.eur_per_token * 1e6).toFixed(2).padStart(7)} EUR/M` +
      `   out ${(m.output.eur_per_token * 1e6).toFixed(2).padStart(7)} EUR/M`
  );
}
console.log(`  audio   : ${Object.keys(audio).length}`);
for (const [name, a] of Object.entries(audio).sort()) {
  const impact = a.g_co2e_per_second == null ? 'no CO2e figure' : `${(a.g_co2e_per_second * 60).toFixed(3)} g CO2e/min`;
  console.log(
    `    ${name.padEnd(28)} ${(a.eur_per_second * 60).toFixed(4).padStart(8)} EUR/min   ${impact}`
  );
}
