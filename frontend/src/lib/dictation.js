// Recording audio in a browser, with the parts that differ between browsers
// kept in one place.
//
// Nothing here decides anything about the interview. It captures a clip and
// hands back a Blob; the server transcribes it and the student edits the
// result. The audio never leaves this module except as that Blob, and it is
// released as soon as the recording stops — a page that has finished recording
// holds no microphone.

/**
 * Formats to offer, best first.
 *
 * Opus in WebM is what Chrome, Firefox and Edge produce and is the smallest of
 * these by a wide margin, which matters on school wifi. Safari — desktop and
 * iOS — supports none of the WebM variants and produces MP4/AAC instead, so the
 * list ends there rather than at a WebM the browser would silently refuse.
 *
 * Kept in step with EXTENSION_BY_TYPE in backend/src/llm/transcribe.js: a
 * format this picks that the server rejects is a 415 the student cannot act on.
 */
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

/** The first format this browser will actually record, or null if none. */
export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  // Safari has historically supported MediaRecorder while reporting nothing
  // through isTypeSupported. An empty string tells the constructor to choose,
  // and the resulting Blob still carries its real type.
  return '';
}

/**
 * Can this browser record at all?
 *
 * `getUserMedia` lives on a secure-context-only API, so this is also the check
 * for "served over http" — which is the local development case, and the reason
 * this returns false on a colleague's machine running Vite over a LAN address.
 */
export function canRecord() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Below this peak amplitude, nothing reached the microphone.
 *
 * Speech peaks in the 0.1–0.6 range even from a quiet speaker at arm's length.
 * A muted or disconnected input sits at 0, and a live input in a silent room
 * still shows noise around 0.001–0.005. 0.02 sits in the gap: an order of
 * magnitude above room noise, an order of magnitude below anyone talking.
 */
const SILENCE_PEAK = 0.02;

/**
 * Watch how loud the microphone actually is, for the duration of a recording.
 *
 * This exists because of a real failure. A machine with several inputs had the
 * wrong one selected — a microphone that was not working — and every recording
 * came back from Whisper as "Hvala što pratite kanal", *thank you for watching
 * the channel*, a subtitle it had learnt to put over silent video. The
 * transcript looked like a transcript. Nothing indicated the microphone was
 * dead, so the natural response was to record again, and get the same sentence
 * again.
 *
 * Reading the level locally answers that before a request is made: it costs
 * nothing, it is instant, and it tells the student the one thing that actually
 * helps — the problem is the input device, not their speaking.
 *
 * Returns `{ peak() }`, or a stub reporting a healthy level if the Web Audio
 * API is unavailable. A browser without it must not lose the ability to
 * dictate; it only loses the warning.
 */
function watchLevel(stream) {
  let AudioCtx;
  try {
    AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtx) throw new Error('no AudioContext');
  } catch {
    return { peak: () => 1, current: () => 0, stop() {} };
  }

  const context = new AudioCtx();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  let peak = 0;
  let current = 0;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    let frameMax = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const value = Math.abs(buffer[i]);
      if (value > frameMax) frameMax = value;
    }
    if (frameMax > peak) peak = frameMax;
    // Rise immediately, fall gradually. A meter that tracks the raw frame
    // flickers on every syllable gap and reads as a fault; one that decays
    // looks like a level meter and stays legible on a projector.
    current = frameMax > current ? frameMax : current * 0.8 + frameMax * 0.2;
  }, 50);

  return {
    peak: () => peak,
    /** The live level, 0–1, for the meter shown while recording. */
    current: () => current,
    stop() {
      clearInterval(timer);
      source.disconnect();
      // Closing releases the audio hardware. Left open, each recording leaks
      // one context, and browsers cap how many a page may hold.
      context.close().catch(() => {});
    },
  };
}

/**
 * Start recording. Resolves once the microphone is live.
 *
 * Returns a handle with `stop()` — which resolves to the recorded Blob — and
 * `cancel()`, which discards it. Both release the microphone; the browser's
 * recording indicator staying lit after a student is finished is alarming in a
 * way that is entirely our fault when it happens.
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // A classroom is the target environment, not a studio. These are hints
      // and every browser implements them differently, but where they are
      // honoured they remove exactly the noise thirty other students make.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data?.size > 0) chunks.push(e.data);
  });

  const level = watchLevel(stream);

  const release = () => {
    level.stop();
    for (const track of stream.getTracks()) track.stop();
  };

  const finished = new Promise((resolve, reject) => {
    recorder.addEventListener('stop', () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    });
    recorder.addEventListener('error', (e) => reject(e.error ?? new Error('recording failed')));
  });

  recorder.start();
  const startedAt = Date.now();

  return {
    mimeType: recorder.mimeType || mimeType,
    startedAt,
    get state() {
      return recorder.state;
    },
    /** Live input level, 0–1, for the meter. Read on a timer while recording. */
    level: () => level.current(),
    /**
     * Stop and hand back the recording.
     *
     * `heardSomething` is false when the microphone never registered above
     * room noise — read before `release()` tears the analyser down. The caller
     * uses it to say "check your microphone" rather than spending a
     * transcription call on silence and getting a plausible sentence back.
     */
    async stop() {
      if (recorder.state !== 'inactive') recorder.stop();
      try {
        const blob = await finished;
        const peak = level.peak();
        return { blob, peak, heardSomething: peak >= SILENCE_PEAK };
      } finally {
        release();
      }
    },
    cancel() {
      // Order matters: stopping the tracks first can make some browsers fire
      // `stop` with no final chunk, which is what we want when discarding.
      release();
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

/**
 * Join a transcript onto whatever the student has already written.
 *
 * Appending rather than replacing, because dictation is used mid-answer as
 * often as at the start — a student types a sentence, gets stuck, and speaks
 * the rest. Replacing would silently delete the part they typed, which is the
 * kind of loss that stops someone using a feature permanently.
 */
export function appendTranscript(existing, transcript) {
  const before = (existing ?? '').trimEnd();
  const addition = (transcript ?? '').trim();
  if (!addition) return existing ?? '';
  if (!before) return addition;
  // A sentence that already ends in punctuation gets a space; one that does not
  // gets a space too. The student is going to edit this either way, and
  // guessing at punctuation would be a worse kind of wrong.
  return `${before} ${addition}`;
}

/**
 * Which browser, for the purpose of telling someone where the microphone
 * setting lives.
 *
 * User-agent sniffing, which is the wrong tool for almost everything and the
 * only tool for this. There is no API that reports where a browser keeps its
 * permission UI, and once a permission is blocked **no API can ask for it
 * again** — `getUserMedia` simply rejects, forever, without prompting. The only
 * way out is the student changing it themselves, so the only useful thing we
 * can do is name the right menu.
 *
 * Deliberately coarse. Getting it wrong shows slightly misleading instructions;
 * not attempting it shows none.
 *
 * Order matters. Every Chromium browser claims to be Chrome and Safari, and
 * every iOS browser is Safari underneath whatever it is called, so the
 * narrowest tests come first.
 */
export function browserFamily(ua = navigator.userAgent, vendor = navigator.vendor ?? '') {
  const s = String(ua);
  // iOS first: Chrome and Firefox on iPhone are Safari wearing a different
  // name, and their permissions live in the iOS Settings app, not in the page.
  if (/iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && navigator.maxTouchPoints > 1)) {
    return 'safariIos';
  }
  if (/Firefox\/|FxiOS/.test(s)) return 'firefox';
  if (/Edg\//.test(s)) return 'chrome';          // Edge is Chromium; same UI.
  if (/OPR\/|Opera/.test(s)) return 'chrome';    // As is Opera.
  if (/Chrome\/|Chromium\//.test(s)) return 'chrome';
  // Only after every Chromium has been excluded, because they all say Safari.
  if (/Safari\//.test(s) && /Apple/.test(vendor)) return 'safari';
  return 'other';
}

/**
 * Has the microphone been permanently blocked for this site?
 *
 * `navigator.permissions` answers this directly where it exists — but **Safari
 * does not implement it for the microphone**, which is the browser where the
 * recovery path is hardest to describe and where knowing would help most. So
 * this returns null rather than false when it cannot tell, and callers treat
 * null as "ask and find out".
 */
export async function microphoneBlocked() {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' });
    if (!status) return null;
    return status.state === 'denied';
  } catch {
    return null;
  }
}
