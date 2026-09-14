import { useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../i18n/index.js';

/**
 * The teacher's two sections. Uses the app's segmented-control pattern rather
 * than links so the active state is a real pressed button for assistive tech.
 */
export default function TeacherTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useT();

  const tabs = [
    { path: '/teacher', label: t.teacher.title, active: !pathname.startsWith('/teacher/content') },
    { path: '/teacher/content', label: t.content.title, active: pathname.startsWith('/teacher/content') },
  ];

  return (
    <nav className="tabs" aria-label={t.teacher.sections}>
      {tabs.map((tab) => (
        <button
          key={tab.path}
          type="button"
          className={tab.active ? 'active' : ''}
          aria-current={tab.active ? 'page' : undefined}
          onClick={() => navigate(tab.path)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
