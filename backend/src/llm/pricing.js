// Cost and environmental impact per LLM call.
//
// Rates come from backend/pricing/scaleway.json, refreshed by
// scripts/refresh-pricing.js and committed. Reading a file rather than calling
// the pricing API keeps the interview request path free of a network
// dependency: a pricing outage must never turn a student's answer into an
// error.
//
// Everything here is best-effort by design. An unknown model, a missing usage
// object or a malformed table returns null and the call is stored unpriced —
// never an exception. Cost is bookkeeping; the interview is the product.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABLE_PATH = path.resolve(__dirname, '../../pricing/scaleway.json');

let table = null;
let loadFailed = false;

function getTable() {
  if (table || loadFailed) return table;
  try {
    table = JSON.parse(readFileSync(TABLE_PATH, 'utf8'));
  } catch (err) {
    // Warn once. The platform runs fine unpriced.
    console.error(`[pricing] no price table (${err.message}) — calls will be stored unpriced`);
    loadFailed = true;
  }
  return table;
}

/**
 * Price one LLM call.
 *
 * `model` must be the model the API reported, not the configured name, so the
 * rate matches what actually ran.
 *
 * Returns null when the model is not in the table — which is the correct
 * outcome for the Together.ai rows predating the Scaleway migration, since
 * Scaleway's catalog cannot price another vendor's traffic. Those stay
 * honestly unpriced rather than being given a fabricated rate.
 */
export function priceUsage(model, usage) {
  const t = getTable();
  const rates = t?.models?.[model];
  if (!rates?.input || !rates?.output) return null;

  const inTok = usage?.prompt_tokens;
  const outTok = usage?.completion_tokens;
  if (!Number.isFinite(inTok) || !Number.isFinite(outTok)) return null;

  return {
    cost_eur: inTok * rates.input.eur_per_token + outTok * rates.output.eur_per_token,
    co2e_g: inTok * rates.input.g_co2e_per_token + outTok * rates.output.g_co2e_per_token,
    water_l: inTok * rates.input.l_water_per_token + outTok * rates.output.l_water_per_token,
    pricing_version: t.version,
  };
}

/**
 * Price one speech-to-text call, by how much audio it was given.
 *
 * Separate from `priceUsage` because the billing unit is different in kind:
 * Scaleway sells whisper-large-v3 by the second (catalogued in units of 60),
 * and it reports no output side at all. Feeding an audio model through the
 * token path would silently return null; feeding a chat model through this one
 * would silently return nothing. Neither can happen if they are two functions.
 *
 * The impact fields are `null` when the catalog publishes no figure, and that
 * null is carried all the way to the database rather than being coalesced to
 * zero. Scaleway currently publishes `kg_co2_equivalent: 0` for Whisper and no
 * water figure whatsoever — meaning "not estimated", not "none consumed". A
 * zero stored here would later be summed into a total that quietly asserts
 * transcription is free of impact, which is not something anyone has measured.
 */
export function priceAudio(model, seconds) {
  const t = getTable();
  const rates = t?.audio?.[model];
  if (!rates || !Number.isFinite(rates.eur_per_second)) return null;
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  const perSecond = (rate) => (rate == null ? null : seconds * rate);

  return {
    audio_seconds: seconds,
    cost_eur: seconds * rates.eur_per_second,
    co2e_g: perSecond(rates.g_co2e_per_second),
    water_l: perSecond(rates.l_water_per_second),
    pricing_version: t.version,
  };
}

/** The loaded table's version, or null. Exposed for reporting. */
export function pricingVersion() {
  return getTable()?.version ?? null;
}
