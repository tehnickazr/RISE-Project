/**
 * What the student sees immediately before the browser's permission prompt.
 *
 * Without this, the browser dialog arrives unannounced, mid-interview, while
 * they are trying to answer a question — and "Block" is the reflex when a
 * machine asks for a microphone with no explanation. That reflex is expensive
 * in a way most permission prompts are not: **a blocked microphone cannot be
 * re-requested.** `getUserMedia` never prompts again, so one careless click
 * removes the feature permanently until the student finds the setting
 * themselves, in a menu that is different in every browser.
 *
 * So: say what is about to happen, say what happens to the recording, and let
 * them decline here — where declining costs nothing and leaves the prompt
 * unasked — rather than in the browser dialog, where it costs the feature.
 *
 * Shown once per browser. Remembered in `localStorage`, which is exactly the
 * kind of per-viewer convenience it is for: losing it means one extra dialog,
 * never a lost answer.
 */
export default function MicPrimer({ t, onAllow, onCancel }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mic-primer-title">
      <div className="modal-panel mic-primer">
        <div className="modal-header">
          <h2 id="mic-primer-title">{t.interview.dictate.primer.title}</h2>
        </div>

        <p>{t.interview.dictate.primer.body}</p>

        <ul className="mic-primer-points">
          <li>{t.interview.dictate.primer.notStored}</li>
          <li>{t.interview.dictate.primer.review}</li>
          <li>{t.interview.dictate.primer.optional}</li>
        </ul>

        <p className="mic-primer-next">{t.interview.dictate.primer.next}</p>

        <div className="modal-actions">
          {/* Cancel first in the DOM, primary action last and autofocused:
              the destructive-by-accident choice should not be the one under a
              hurried Return keypress. */}
          <button type="button" className="button ghost" onClick={onCancel}>
            {t.interview.dictate.primer.cancel}
          </button>
          <button type="button" onClick={onAllow} autoFocus>
            {t.interview.dictate.primer.allow}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Where the "shown already" flag lives. Exported so the button can clear it. */
export const PRIMED_KEY = 'rise.dictation.primed';

export function hasBeenPrimed() {
  try {
    return localStorage.getItem(PRIMED_KEY) === '1';
  } catch {
    // Private browsing, or site data blocked. Showing the primer every time is
    // a small annoyance; throwing here would break the button entirely.
    return false;
  }
}

export function rememberPrimed() {
  try {
    localStorage.setItem(PRIMED_KEY, '1');
  } catch {
    /* see above */
  }
}
