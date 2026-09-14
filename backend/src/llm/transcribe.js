// Speech to text — Scaleway Generative APIs (OpenAI-compatible).
//
// Sits beside llm.js and follows its rules: the vendor lives in config, the
// timeout is explicit because Node's fetch has none, and nothing a student
// produced is ever written to a log.
//
// Scaleway needs no new agreement for this — it is already the named
// sub-processor for inference, in the Paris region, so a student's voice never
// leaves the EU and no browser speech API is involved. The alternative,
// `webkitSpeechRecognition`, would have sent the audio to Google or Apple.
//
// What this file deliberately does not do: infer anything about the speaker.
// Whisper returns text, timings and decoding statistics, and that is all we
// ask of it. Inferring emotion from a person's voice inside an education
// institution is a prohibited practice under Article 5(1)(f) of the EU AI Act
// — not a high-risk one requiring an assessment, a forbidden one — so there is
// no configuration of this file that should ever grow one.

import { priceAudio } from './pricing.js';

const BASE_URL = process.env.SCW_BASE_URL || 'https://api.scaleway.ai/v1';
const TRANSCRIBE_URL = `${BASE_URL}/audio/transcriptions`;

// Pinned by name rather than reusing SCW_MODEL: the chat model and the
// transcription model are swapped for entirely different reasons, and sharing
// one variable would mean a chat upgrade silently pointing audio at a model
// that cannot accept it.
const MODEL = process.env.SCW_TRANSCRIBE_MODEL || 'whisper-large-v3';

// Generous, and for a different reason than the chat timeout. Whisper's cost is
// dominated by upload: a 3 MB clip from a classroom on school wifi can take
// longer to send than to transcribe. A false timeout costs the student the
// recording they just made, which is the one failure that would stop them
// using the feature again.
const TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS ?? 60000);

/** Formats MediaRecorder actually produces, mapped to the filename Whisper needs. */
const EXTENSION_BY_TYPE = new Map([
  ['audio/webm', 'webm'],   // Chrome, Firefox, Edge
  ['audio/ogg', 'ogg'],     // Firefox, some Android builds
  ['audio/mp4', 'mp4'],     // Safari, desktop and iOS
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/flac', 'flac'],
]);

/** The bare type, without the `;codecs=opus` MediaRecorder appends. */
export function baseMimeType(contentType) {
  return String(contentType ?? '').split(';')[0].trim().toLowerCase();
}

export function isSupportedAudioType(contentType) {
  return EXTENSION_BY_TYPE.has(baseMimeType(contentType));
}

export const SUPPORTED_AUDIO_TYPES = [...EXTENSION_BY_TYPE.keys()];

export class TranscriptionError extends Error {
  constructor(message, { status = null, timedOut = false } = {}) {
    super(message);
    this.name = 'TranscriptionError';
    this.status = status;
    this.timedOut = timedOut;
  }
}

// Thresholds are Whisper's own, from the reference decoder: a mean token
// log-probability below -1.0 marks a segment as failed, and a gzip compression
// ratio above 2.4 marks it as degenerate repetition. Both are what the upstream
// implementation uses to decide a decode is untrustworthy.
const MIN_AVG_LOGPROB = -1.0;
const MAX_COMPRESSION_RATIO = 2.4;

// Below this many characters per second of audio, whatever came back is not a
// transcript of someone speaking. Ordinary speech runs about 13 characters a
// second (measured: 254 characters over 19 seconds in the probe below); even
// slow, hesitant speech stays well above 2. Ten seconds of near-silence came
// back as "Hvala." — six characters, 0.6 a second.
const MIN_CHARS_PER_SECOND = 2;

/**
 * Should the student be told to check this transcript particularly carefully?
 *
 * Trained overwhelmingly on subtitled video, Whisper does not return an empty
 * string for silence — it returns whatever its training data put over silent
 * footage. Measured against the live endpoint on 3 September 2026, ten seconds
 * of near-silence came back as "Hvala."
 *
 * The obvious signals do not catch that, and it is worth being precise about
 * why, because both look like they should:
 *
 *   - `no_speech_prob` is the field the OpenAI documentation points at.
 *     **Scaleway returns it as null on every segment.** A check built on it
 *     would never once have fired, and would have looked like it worked.
 *   - `avg_logprob` and `compression_ratio` are populated, but no threshold on
 *     them fits. The hallucinated "Hvala." scored -0.165, against -0.024 to
 *     -0.054 for real speech: worse, but nowhere near -1.0, the value Whisper's
 *     own decoder uses to call a segment failed. Whisper's threshold is far too
 *     loose to catch it, and one tight enough — around -0.1 — sits inside the
 *     range genuine speech occupies. Those figures come from a synthesised
 *     voice in silence, the cleanest audio this system will ever see; a student
 *     in a workshop will score well below -0.165 while saying something
 *     perfectly good, so the tight threshold would reject real answers.
 *
 * What does separate them is how much text came back for how much audio. A
 * transcript is a rate, and a rate an order of magnitude below human speech
 * means the recording carried no speech — a muted microphone, the wrong input
 * device, or a student who never started talking.
 *
 * The confidence thresholds are kept anyway, because they catch a different
 * failure this one does not: degenerate repetition, where the model emits the
 * same phrase for a minute and the character rate looks perfectly healthy.
 *
 * Only ever a warning. The student's own eyes on the text before they submit
 * are the real protection — "Hvala." in the answer box is self-evidently wrong
 * in a way no heuristic needs to explain.
 */
export function looksUnreliable(text, segments) {
  const seconds = Array.isArray(segments)
    ? segments.reduce((n, s) => n + (Number(s.end) - Number(s.start) || 0), 0)
    : 0;

  if (seconds > 1 && text.length / seconds < MIN_CHARS_PER_SECOND) return true;

  if (!Array.isArray(segments) || segments.length === 0) return false;

  const duration = (s) => Number(s.end) - Number(s.start) || 0;
  if (seconds <= 0) return false;

  const suspect = segments.filter((s) => {
    const logprob = Number(s.avg_logprob);
    const ratio = Number(s.compression_ratio);
    const noSpeech = s.no_speech_prob == null ? null : Number(s.no_speech_prob);
    return (
      (Number.isFinite(logprob) && logprob < MIN_AVG_LOGPROB) ||
      (Number.isFinite(ratio) && ratio > MAX_COMPRESSION_RATIO) ||
      (noSpeech != null && noSpeech > 0.6)
    );
  });

  return suspect.reduce((n, s) => n + duration(s), 0) / seconds > 0.5;
}

/**
 * How much audio this call is billed for.
 *
 * `usage.seconds` is the provider's own billed quantity — 20 for a 19.06-second
 * clip, so it is rounded up, and using it means the recorded cost is what will
 * appear on the invoice rather than a reconstruction of it. The OpenAI-shaped
 * `duration` field is not returned by Scaleway at all; the end of the last
 * segment is the fallback, and it under-reports by design rather than over.
 */
function billedSeconds(body) {
  const usage = Number(body?.usage?.seconds);
  if (Number.isFinite(usage) && usage >= 0) return usage;

  const duration = Number(body?.duration);
  if (Number.isFinite(duration) && duration >= 0) return duration;

  const end = Number(body?.segments?.at?.(-1)?.end);
  return Number.isFinite(end) && end >= 0 ? end : null;
}

/**
 * Transcribe one recording.
 *
 * `language` is passed to the API rather than left to auto-detection, and that
 * is load-bearing for us specifically: Serbian, Croatian and Bosnian are close
 * enough that Whisper's detector wanders between them, and a misdetection makes
 * it *translate* instead of transcribe — handing the student back an English
 * paraphrase of their own answer. The session already knows its language, so
 * there is no reason to guess.
 *
 * Returns the text plus the metering the caller persists. Never returns audio,
 * and never logs the transcript: it is a student's answer before they have even
 * decided to submit it.
 */
export async function transcribe(audio, { contentType, language, label = 'dictation' } = {}) {
  const apiKey = process.env.SCW_SECRET_KEY;
  if (!apiKey) throw new Error('SCW_SECRET_KEY is required');

  const type = baseMimeType(contentType);
  const extension = EXTENSION_BY_TYPE.get(type);
  if (!extension) throw new TranscriptionError(`unsupported audio type: ${type || 'none'}`);

  const form = new FormData();
  // The API reads the format from the filename extension, not from the part's
  // content type, so the name is not decoration.
  form.append('file', new Blob([audio], { type }), `audio.${extension}`);
  form.append('model', MODEL);
  // verbose_json for the duration — which is what the call is billed on — and
  // for the per-segment no_speech_prob above. `json` returns neither.
  form.append('response_format', 'verbose_json');
  if (language) form.append('language', language);

  const started = Date.now();
  let res;
  try {
    res = await fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      console.error(`[transcribe] ${label} timed out after ${TIMEOUT_MS} ms`);
      throw new TranscriptionError(`transcription timed out after ${TIMEOUT_MS} ms`, {
        timedOut: true,
      });
    }
    throw new TranscriptionError(`transcription request failed: ${err.message}`);
  }

  if (!res.ok) {
    // The body may quote the audio's own metadata back. Keep the status and a
    // short slice, in the same spirit as describeShape() in llm.js.
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    console.error(`[transcribe] ${label} HTTP ${res.status}: ${detail}`);
    throw new TranscriptionError(`transcription failed (${res.status})`, { status: res.status });
  }

  const body = await res.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const seconds = billedSeconds(body);
  const pricing = seconds == null ? null : priceAudio(MODEL, seconds);

  console.log(
    `[transcribe] ${label} ok in ${Date.now() - started} ms · ` +
      `${seconds == null ? 'unknown' : seconds.toFixed(1)} s audio · ` +
      `${text.length} chars · ${pricing ? `${pricing.cost_eur.toFixed(6)} EUR` : 'unpriced'}`
  );

  return {
    text,
    model: MODEL,
    audio_seconds: seconds,
    low_confidence: looksUnreliable(text, body?.segments),
    pricing,
  };
}
