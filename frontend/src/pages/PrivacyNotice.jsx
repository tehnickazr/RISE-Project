import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { normalizeLanguage, useT } from '../i18n/index.js';
import { SUPPORTED_LANGUAGES } from '../i18n/languages.js';
import {
  NOTICE_LANGUAGES,
  NOTICE_VERSION,
  STAFF_NOTICE_LANGUAGES,
  isStaffRole,
  loadNotice,
} from '../content/notice.js';
import { fillNotice } from '../content/fill-notice.js';
import logo from '../assets/images/Logo_Rise.svg';

const LANGUAGE_NAMES = { sr: 'SR', en: 'EN', fr: 'FR', pt: 'PT' };
const ALL_LANGUAGES = ['sr', 'en', 'fr', 'pt'];

/**
 * Minimal emphasis rendering. The notice content carries **bold** and *italic*
 * because it is prose written for people rather than markup, and a full
 * Markdown dependency for two constructs would be a poor trade.
 */
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * A sentence the school supplies.
 *
 * Boxed and labelled *only while it is still unfinished*. Once the school has
 * filled it in it is ordinary prose, like every other sentence around it.
 *
 * The label used to be unconditional, and it leaked a build-time affordance
 * into what a fifteen-year-old reads: a notice visibly assembled from parts,
 * with one part disowned by the people who sent it. A filled sentence is not
 * "to be completed by your school" — it is the school talking.
 *
 * The visible treatment is kept for a sentence that genuinely still has a blank
 * in it, because a gap should look like a gap. It is the administrator, not the
 * student, who is shown the count and told the notice is unfinished.
 */
function SchoolBlock({ label, children }) {
  if (!children) return null;
  const unfinished = /<[^>]+>/.test(String(children));
  if (!unfinished) return <p className="notice-school">{children}</p>;
  return (
    <div className="school-block">
      <b>{label}</b>
      {children}
    </div>
  );
}

export default function PrivacyNotice({ mustAcknowledge = false }) {
  const { lang: langParam } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState(null);

  // Precedence: an explicit language in the URL, then the signed-in person's
  // own language, then English. On the sign-up screen the invitation's language
  // is passed in the URL, because there is no account yet to read it from.
  // `/privacy/staff` forces the staff notice; otherwise a signed-in teacher or
  // administrator gets it by role. Students never reach it either way.
  // `/privacy/read` is the gate, not a language. Fall through to the reader's
  // own language, exactly as the bare `/privacy` path does.
  const gate = langParam === 'read' || mustAcknowledge;
  const staff =
    langParam === 'staff' || ((!langParam || gate) && isStaffRole(user?.role));
  const available = staff ? STAFF_NOTICE_LANGUAGES : NOTICE_LANGUAGES;

  // `normalizeLanguage` answers with English for anything it does not
  // recognise, and English is truthy — so testing the URL segment through it
  // made the first branch always win, and the reader's own language was never
  // consulted. `/privacy` with no segment therefore rendered in English for
  // everyone. Nothing linked to it without a language until the gate below, so
  // the bug sat unnoticed: every existing link names its language explicitly.
  //
  // Ask whether the segment *is* a language, rather than what it normalises to.
  const explicit = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;
  const language = explicit ?? normalizeLanguage(user?.preferred_language);

  const [notice, setNotice] = useState(null);
  // The school's own details. Fetched separately from the notice text, because
  // the text is a static module loaded per language and these change whenever
  // an administrator edits them.
  const [schoolValues, setSchoolValues] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadNotice(language, { staff }).then((loaded) => {
      if (!cancelled) setNotice(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [language, staff]);

  useEffect(() => {
    // Only for a signed-in reader. The notice is also shown on the sign-up
    // screen, where there is no session and therefore no school to read from —
    // there the blanks stay visible, which is the honest rendering.
    if (!user) return undefined;
    let cancelled = false;
    api
      .noticeSettings()
      .then((d) => {
        if (!cancelled) setSchoolValues(d.notice_settings);
      })
      // A notice that renders with its blanks showing is a worse notice, not a
      // broken page. Never block the text on this call.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!notice) {
    return (
      <main>
        <p>{t.common.loading}</p>
      </main>
    );
  }

  // Anything the school has not filled in keeps its blank, in the language the
  // sentence is written in.
  const filled = fillNotice(notice, schoolValues, language, { staff });

  return (
    <main className="notice-page">
      <header className="page-header">
        <img className="brand-logo" src={logo} alt="RISE" />
        <div className="notice-langs">
          {ALL_LANGUAGES.map((code) => {
            const isAvailable = available.includes(code);
            return (
              <button
                key={code}
                type="button"
                className={code === language ? 'on' : undefined}
                disabled={!isAvailable}
                onClick={() => navigate(staff ? '/privacy/staff' : `/privacy/${code}`)}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            );
          })}
          {/* No way back when the notice is being shown *because* it has not
              been read. "Back" would land on the page the reader was sent here
              from, which is the app they have not yet been informed about. */}
          {!gate && (
            <button type="button" className="button ghost" onClick={() => navigate(-1)}>
              {notice.backLabel}
            </button>
          )}
        </div>
      </header>

      {gate && (
        <p className="notice-gate-lede" role="status">
          {user?.notice_version ? t.notice.updated : t.notice.first}
        </p>
      )}

      <h1>{notice.title}</h1>
      <p className="notice-meta">
        {NOTICE_VERSION} · {LANGUAGE_NAMES[language]}
      </p>

      {/* Layer 1 — the short version, sized to be read rather than skipped. */}
      <section className="notice-short">
        <p className="notice-headline">{notice.headline}</p>
        <ul>
          {notice.short.map((item) => (
            <li key={item.key}>
              <span className={item.warn ? 'notice-tick warn' : 'notice-tick'} aria-hidden="true">
                {item.warn ? '!' : '•'}
              </span>
              <span>
                <strong>{item.bold}</strong> {item.text}
              </span>
            </li>
          ))}
        </ul>
        <SchoolBlock label={filled.schoolBlockLabel}>{filled.shortSchoolBlock}</SchoolBlock>
        <p className="notice-more">{notice.fullBelow}</p>
      </section>

      {/* Layer 2 — the full text. */}
      {filled.sections.map((section) => (
        <section key={section.id} className="notice-section">
          <h2 id={section.id}>{section.heading}</h2>
          {section.school && (
            <SchoolBlock label={notice.schoolBlockLabel}>{section.school}</SchoolBlock>
          )}
          {section.body?.map((paragraph, i) => (
            <p key={i}>
              <Rich text={paragraph} />
            </p>
          ))}
          {section.callout && (
            <p className="notice-callout">
              <strong>{section.callout}</strong>
            </p>
          )}
          {section.listIntro && <p>{section.listIntro}</p>}
          {section.list && (
            <ul>
              {section.list.map((item, i) => (
                <li key={i}>
                  <Rich text={item} />
                </li>
              ))}
            </ul>
          )}
          {section.table && (
            <table className="notice-table">
              <tbody>
                {section.table.map(([key, value]) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {section.after?.map((paragraph, i) => (
            <p key={i}>
              <Rich text={paragraph} />
            </p>
          ))}
          {section.afterSchool?.map((paragraph, i) => (
            <p key={i}>
              <Rich text={paragraph} />
            </p>
          ))}
        </section>
      ))}

      <section className="notice-section" id="use">
        <h2>{notice.useHeading}</h2>
        <p>{notice.useIntro}</p>
        <ul className="notice-rules">
          {notice.useRules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      {/* At the bottom, not the top: a confirmation placed above the text is a
          button people press instead of reading. This one is reached by having
          scrolled past the notice, which is the weakest honest claim we can
          make and still better than the alternative.

          Deliberately not a checkbox and not the word "agree". There is nothing
          to agree to — the lawful basis is public task, not consent — and a
          consent-shaped control would misrepresent that. It records that the
          notice was shown, which is what Article 13 asks and what the column
          stores. */}
      {gate && (
        <section className="notice-ack">
          {ackError && <p className="error">{ackError}</p>}
          <button
            type="button"
            disabled={acking}
            onClick={async () => {
              setAcking(true);
              setAckError(null);
              try {
                await api.acknowledgeNotice(NOTICE_VERSION, language);
                // Re-read the account before navigating: the gate reads
                // `notice_version` off the user, so leaving without refreshing
                // would bounce straight back here.
                await refreshUser();
                navigate('/', { replace: true });
              } catch {
                setAckError(t.notice.ackFailed);
                setAcking(false);
              }
            }}
          >
            {acking ? t.common.saving : t.notice.ack}
          </button>
        </section>
      )}
    </main>
  );
}
