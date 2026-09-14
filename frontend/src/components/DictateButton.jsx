import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { browserFamily, canRecord, startRecording } from '../lib/dictation.js';
import MicPrimer, { hasBeenPrimed, rememberPrimed } from './MicPrimer.jsx';

/**
 * Record an answer and hand back the transcript.
 *
 * Four states, and the reason each is visible rather than collapsed into a
 * spinner: a student who cannot tell recording from transcribing will either
 * stop talking too early or keep talking into a microphone that is already off.
 *
 *   idle → (primer, once) → recording → transcribing → idle
 *
 * The component never touches the answer text itself. It calls `onTranscript`
 * and the page decides what to do with it, which keeps the rule that a
 * transcript is a suggestion the student edits, not an answer, in one place.
 *
 * Renders nothing at all when the browser cannot record. An enabled button that
 * fails on click teaches a student the feature is broken; an absent one lets
 * them get on with typing.
 */
export default function DictateButton({
  sessionId,
  disabled,
  onTranscript,
  onError,
  onRecordingChange,
  t,
}) {
  const [state, setState] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [priming, setPriming] = useState(false);
  const handleRef = useRef(null);
  const supported = canRecord();

  // A recording still running when the student navigates away holds the
  // microphone open and leaves the browser's indicator lit.
  useEffect(() => {
    return () => handleRef.current?.cancel();
  }, []);

  useEffect(() => {
    if (state !== 'recording') return undefined;
    const started = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
      // Read from the handle rather than pushing from the audio thread: this
      // is the render loop's business, and 100ms is smooth enough for a bar
      // while being cheap enough not to matter on a school laptop.
      setLevel(handleRef.current?.level?.() ?? 0);
    }, 100);
    return () => clearInterval(timer);
  }, [state]);

  if (!supported) return null;

  /**
   * Explain the block, in terms of the browser the student is actually using.
   *
   * Once denied, `getUserMedia` will not prompt again — the setting has to be
   * changed by hand, and every browser hides it somewhere different. A generic
   * "allow access in your browser" is useless at exactly the moment it is
   * needed most.
   */
  const blockedMessage = () => {
    const where = t.interview.dictate.blockedWhere;
    return `${t.interview.dictate.permissionDenied} ${where[browserFamily()] ?? where.other} ${t.interview.dictate.blockedAfter}`;
  };

  const openMicrophone = async () => {
    onError?.(null);
    try {
      handleRef.current = await startRecording();
      setSeconds(0);
      setLevel(0);
      setState('recording');
      onRecordingChange?.(true);
    } catch (err) {
      handleRef.current = null;
      setState('idle');
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        onError?.(blockedMessage());
      } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
        onError?.(t.interview.dictate.noMicrophone);
      } else {
        onError?.(t.interview.dictate.failed);
      }
    }
  };

  const begin = () => {
    // The primer runs before the browser prompt, not instead of it, and only
    // the first time on this browser.
    if (!hasBeenPrimed()) {
      onError?.(null);
      setPriming(true);
      return;
    }
    openMicrophone();
  };

  const finish = async () => {
    const handle = handleRef.current;
    if (!handle) return;
    handleRef.current = null;
    setState('transcribing');
    onRecordingChange?.(false);
    try {
      const { blob, heardSomething } = await handle.stop();

      // Caught before the upload, not after. A microphone that is muted or
      // simply not the one the browser is using produces a recording of
      // silence, and silence sent to Whisper comes back as a confident,
      // plausible sentence — so the student sees a transcript, not a fault,
      // and records again to get the same wrong sentence. Checking the level
      // locally costs nothing and names the actual problem.
      if (!heardSomething) {
        onError?.(t.interview.dictate.silentMic);
        return;
      }

      const result = await api.transcribe(sessionId, blob);
      if (result?.text) {
        onTranscript(result.text, { lowConfidence: result.low_confidence === true });
      } else {
        onError?.(t.interview.dictate.nothingHeard);
      }
    } catch (err) {
      onError?.(err?.status === 429 ? t.interview.dictate.tooMany : t.interview.dictate.failed);
    } finally {
      setState('idle');
      setSeconds(0);
      setLevel(0);
    }
  };

  const abandon = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setState('idle');
    setSeconds(0);
    setLevel(0);
    onRecordingChange?.(false);
  };

  const primer = priming ? (
    <MicPrimer
      t={t}
      onCancel={() => setPriming(false)}
      onAllow={() => {
        rememberPrimed();
        setPriming(false);
        openMicrophone();
      }}
    />
  ) : null;

  if (state === 'recording') {
    return (
      <span className="dictate-row is-recording">
        {/* Status above the controls, not between them. While recording there
            are only two things to do — finish or throw it away — and the
            level, the elapsed time and the pulse are all one piece of
            information: the microphone is live and hearing you. */}
        <span className="dictate-status">
          <span className="dictate-pulse" aria-hidden="true" />
          <span className="dictate-timer" role="timer" aria-live="off">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>
          {/* A bar that does not move while you are speaking says the input
              device is wrong, far more directly than any message afterwards.
              Cube-rooted because loudness is perceptual: a linear bar sits
              near zero through ordinary speech and reads as broken. */}
          <span
            className="dictate-meter"
            role="meter"
            aria-label={t.interview.dictate.meterLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(1, Math.cbrt(level) * 1.15) * 100)}
          >
            <span
              className="dictate-meter-fill"
              style={{ width: `${Math.min(100, Math.cbrt(level) * 115)}%` }}
            />
          </span>
        </span>
        <span className="dictate-controls">
          <button type="button" className="button dictate stop" onClick={finish}>
            {t.interview.dictate.stop}
          </button>
          <button type="button" className="button ghost dictate-cancel" onClick={abandon}>
            {t.interview.dictate.discard}
          </button>
        </span>
        {primer}
      </span>
    );
  }

  return (
    <span className="dictate-row">
      <button
        type="button"
        className="button ghost dictate"
        onClick={begin}
        disabled={disabled || state === 'transcribing'}
      >
        {state === 'transcribing' ? t.interview.dictate.transcribing : t.interview.dictate.start}
      </button>
      {primer}
    </span>
  );
}
