import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseMimeType,
  isSupportedAudioType,
  looksUnreliable,
} from '../src/llm/transcribe.js';

/**
 * The dictation guard, pinned to what the live endpoint actually returns.
 *
 * Every number in this file was measured against Scaleway's whisper-large-v3
 * on 3 September 2026, not reasoned about. That matters because the obvious
 * implementation of this check does not work, and nothing about the code makes
 * that visible: `no_speech_prob` — the field the OpenAI documentation points at
 * for exactly this purpose — comes back `null` on every segment, so a guard
 * built on it would have passed review, shipped, and never once fired.
 */

// Real speech: four segments, 19.06 s of audio, 254 characters.
// A student describing how to diagnose an injection-moulding machine.
const REAL_SPEECH_SEGMENTS = [
  { start: 0, end: 3.8, avg_logprob: -0.054, compression_ratio: 0.906, no_speech_prob: null },
  { start: 4.14, end: 10.82, avg_logprob: -0.041, compression_ratio: 1.071, no_speech_prob: null },
  { start: 11.14, end: 14.94, avg_logprob: -0.024, compression_ratio: 0.93, no_speech_prob: null },
  { start: 14.94, end: 19.06, avg_logprob: -0.049, compression_ratio: 0.879, no_speech_prob: null },
];
const REAL_SPEECH_TEXT =
  'Prvo bih proverio da li ima napajanja pomoću multimetra. Zatim bih pogledao ' +
  'hidraulični sistem, pumpe i ventile, da vidim da li ima curenja ulja. Ako je ' +
  'pritisak nizak, problem je verovatno u pumpi. Takođe bih proverio PLC ' +
  'kontroler i greške na displeju.';

// Ten seconds of near-silence. Whisper returned the single word "Hvala."
const HALLUCINATION_SEGMENTS = [
  { start: 0, end: 10, avg_logprob: -0.165, compression_ratio: 0.467, no_speech_prob: null },
];

test('a real answer is not flagged', () => {
  assert.equal(looksUnreliable(REAL_SPEECH_TEXT, REAL_SPEECH_SEGMENTS), false);
});

test('silence transcribed as a hallucinated word IS flagged', () => {
  // The case the whole guard exists for. Six characters from ten seconds.
  assert.equal(looksUnreliable('Hvala.', HALLUCINATION_SEGMENTS), true);
});

test('the hallucination is confident enough to pass any safe threshold', () => {
  // Pinning the finding rather than the code: if someone later replaces the
  // character-rate check with a threshold on avg_logprob, this fails and says
  // why.
  //
  // The invented word scored -0.165. That is worse than real speech
  // (-0.024 to -0.054) but nowhere near -1.0, the value Whisper's own decoder
  // uses to declare a segment failed. So a threshold cannot separate them:
  // Whisper's own is far too loose to catch it, and one tight enough to catch
  // it sits at roughly -0.1 — inside the range genuine speech occupies. These
  // segments come from a synthesised voice in silence, which is the cleanest
  // audio this system will ever see; a real student in a workshop will score
  // well below -0.165 while saying something perfectly good.
  const invented = HALLUCINATION_SEGMENTS[0].avg_logprob;
  const worstReal = Math.min(...REAL_SPEECH_SEGMENTS.map((s) => s.avg_logprob));

  assert.ok(invented > -1.0, 'Whisper\'s own failure threshold does not catch this');
  assert.ok(
    invented - worstReal > -0.2,
    'the gap between invented and genuine is small enough that no threshold fits ' +
      'between them without rejecting real answers'
  );
});

test('no_speech_prob is null from this provider, so it cannot carry the check alone', () => {
  const nulls = [...REAL_SPEECH_SEGMENTS, ...HALLUCINATION_SEGMENTS];
  assert.ok(
    nulls.every((s) => s.no_speech_prob === null),
    'if Scaleway starts populating no_speech_prob this assertion fails, and the guard ' +
      'can be simplified — that is a welcome failure, not a broken test'
  );
});

test('degenerate repetition is caught even at a healthy character rate', () => {
  // The other Whisper failure: one phrase emitted over and over. Plenty of
  // characters per second, so the rate check passes it; the compression ratio
  // is what gives it away.
  const looped = 'Hvala vam. '.repeat(40);
  const segments = [
    { start: 0, end: 30, avg_logprob: -0.4, compression_ratio: 8.2, no_speech_prob: null },
  ];
  assert.equal(looksUnreliable(looped, segments), true);
});

test('a brief but genuine answer is not flagged for being short', () => {
  // Six seconds, 78 characters — 13 a second. Short answers are legitimate and
  // must not be treated as failed recordings.
  const segments = [
    { start: 0, end: 6, avg_logprob: -0.08, compression_ratio: 1.0, no_speech_prob: null },
  ];
  assert.equal(
    looksUnreliable('Proverio bih napajanje multimetrom i pogledao da li ima curenja ulja.', segments),
    false
  );
});

test('an empty transcript over real audio is flagged', () => {
  assert.equal(looksUnreliable('', REAL_SPEECH_SEGMENTS), true);
});

test('missing or empty segments are not treated as a failure', () => {
  // The API omitting segments is our problem, not the student's — and their
  // text may be perfectly good. Warning on it would train them to ignore the
  // warning.
  assert.equal(looksUnreliable('Neki odgovor.', undefined), false);
  assert.equal(looksUnreliable('Neki odgovor.', []), false);
});

test('MediaRecorder content types are accepted, with their codec parameters', () => {
  // What the browsers actually send. Chrome and Firefox append `;codecs=opus`,
  // and a server that only matched the bare type would 415 every Chrome user.
  assert.equal(isSupportedAudioType('audio/webm;codecs=opus'), true);
  assert.equal(isSupportedAudioType('audio/webm'), true);
  assert.equal(isSupportedAudioType('audio/ogg;codecs=opus'), true);
  assert.equal(isSupportedAudioType('audio/mp4'), true); // Safari, desktop and iOS
  assert.equal(baseMimeType('AUDIO/WEBM;codecs=opus'), 'audio/webm');
});

test('anything that is not audio is refused', () => {
  assert.equal(isSupportedAudioType('application/json'), false);
  assert.equal(isSupportedAudioType(''), false);
  assert.equal(isSupportedAudioType(undefined), false);
});
