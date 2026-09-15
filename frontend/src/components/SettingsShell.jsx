import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';
import ContentSourceSettings from './ContentSourceSettings.jsx';
import SessionLimitsSettings from './SessionLimitsSettings.jsx';
import PrivacyNoticeSettings from './PrivacyNoticeSettings.jsx';
import SupportContactsSettings from './SupportContactsSettings.jsx';

/**
 * A rail, not more tabs.
 *
 * Four settings sections do not fit in a tab row that already carries Users and
 * Settings, and nesting tabs inside tabs reads as two navigations arguing. The
 * rail also gives each section a permanent place to carry a *status*, which is
 * the part that matters: "3 empty" is how an administrator learns the privacy
 * notice is unfinished without opening it, and it is the only reason anyone
 * would visit that page a second time.
 *
 * The gap count is fetched here rather than inside the privacy page, because
 * the whole point is to show it while that page is closed.
 */
const SECTIONS = [
  { id: 'content', label: (t) => t.settings.content, render: () => <ContentSourceSettings /> },
  { id: 'limits', label: (t) => t.settings.limits, render: () => <SessionLimitsSettings /> },
  { id: 'privacy', label: (t) => t.settings.privacy, render: () => <PrivacyNoticeSettings /> },
  { id: 'support', label: (t) => t.settings.support, render: () => <SupportContactsSettings /> },
];

export default function SettingsShell() {
  const t = useT();
  const [active, setActive] = useState('content');
  const [gaps, setGaps] = useState(null);
  const [supportSet, setSupportSet] = useState(null);

  // Both pips come from one pass, on mount and after any save inside a section.
  const loadStatus = () => {
    api.privacySettings().then((d) => setGaps(d.gaps.length)).catch(() => setGaps(null));
    api.supportSettings()
      .then((d) => setSupportSet(Boolean(d.settings.support_email)))
      .catch(() => setSupportSet(null));
  };

  useEffect(loadStatus, []);

  /**
   * Three levels, not two.
   *
   * An unfinished privacy notice is a legal document with holes in it and
   * stays red. A missing support contact is a to-do: students fall back to
   * the platform's own address, nothing is broken, and painting it the same
   * red taught readers to ignore both.
   */
  const pipFor = (id) => {
    if (id === 'privacy' && gaps !== null) {
      return gaps === 0
        ? { text: t.settings.complete, level: 'ok' }
        : { text: t.settings.empty(gaps), level: 'bad' };
    }
    if (id === 'support' && supportSet !== null && !supportSet) {
      return { text: t.settings.notSet, level: 'todo' };
    }
    return null;
  };

  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="settings-shell">
      <nav className="settings-rail" aria-label={t.settings.sections}>
        {SECTIONS.map((s) => {
          const pip = pipFor(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={s.id === active ? 'on' : undefined}
              aria-current={s.id === active ? 'page' : undefined}
              onClick={() => setActive(s.id)}
            >
              <span>{s.label(t)}</span>
              {pip && <span className={`pip ${pip.level}`}>{pip.text}</span>}
            </button>
          );
        })}
      </nav>

      {/* Remounted per section on purpose: each panel loads its own data on
          mount, so switching away and back is also how an administrator
          refreshes one. Keying on the id is what makes that happen. */}
      <div className="settings-body" key={section.id} onBlur={loadStatus}>
        {section.render()}
      </div>
    </div>
  );
}
