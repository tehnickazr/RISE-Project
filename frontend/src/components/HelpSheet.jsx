import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.js';

/**
 * Who to contact, in the order a student should try.
 *
 * Three destinations, deliberately not one. A single "contact us" address would
 * route erasure requests into an IT inbox, where Article 12's one-month clock
 * runs while nobody with authority has seen it. So:
 *
 *   1. the school   — who you are, your account, your class
 *   2. the platform — something is broken
 *   3. the officer  — your data
 *
 * A student cannot reliably classify their own problem, so the sheet does not
 * ask them to: it lists all three with one line each saying what belongs where,
 * and puts the school first because that is who knows them.
 *
 * An entry with no address is omitted entirely rather than shown empty. Unlike
 * the privacy notice, where a gap has to be visible because the document is a
 * legal instrument, a help sheet with `<email>` in it is worse than a help sheet
 * with two entries.
 */
export default function HelpSheet({ support, onClose }) {
  const t = useT();
  const school = support?.school;
  const platform = support?.platform;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="help-title">{t.help.title}</h2>
          <button className="button ghost" type="button" onClick={onClose}>
            {t.help.close}
          </button>
        </div>

        <p className="section-intro">{t.help.intro}</p>

        <div className="help-sheet">
          {school?.support_email && (
            <div className="help-option">
              <span className="n" aria-hidden="true">1</span>
              <span>
                <b>{school.support_name || t.help.schoolTitle}</b>
                <span className="what">{t.help.schoolWhat}</span>
                <a href={`mailto:${school.support_email}`}>{school.support_email}</a>
                {school.support_phone && <span className="when">{school.support_phone}</span>}
                {school.support_hours && <span className="when">{school.support_hours}</span>}
              </span>
            </div>
          )}

          {platform?.support_email && (
            <div className="help-option is-platform">
              <span className="n" aria-hidden="true">{school?.support_email ? 2 : 1}</span>
              <span>
                <b>{t.help.platformTitle}</b>
                <span className="what">{t.help.platformWhat}</span>
                <a href={`mailto:${platform.support_email}`}>{platform.support_email}</a>
              </span>
            </div>
          )}

          {/* The data protection officer is never an address typed on the help
              page — it is read from the privacy notice, which is where it is
              maintained and where the rest of the answer already lives. */}
          <div className="help-option is-dpo">
            <span className="n" aria-hidden="true">
              {1 + (school?.support_email ? 1 : 0) + (platform?.support_email ? 1 : 0)}
            </span>
            <span>
              <b>{t.help.dpoTitle}</b>
              <span className="what">{t.help.dpoWhat}</span>
              <Link to="/privacy" onClick={onClose}>{t.help.readNotice}</Link>
            </span>
          </div>
        </div>

        {!school?.support_email && !platform?.support_email && (
          <p className="field-hint">{t.help.none}</p>
        )}
      </section>
    </div>
  );
}
