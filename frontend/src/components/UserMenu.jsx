import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../i18n/index.js';
import HelpSheet from './HelpSheet.jsx';

function initials(nameOrEmail) {
  const parts = (nameOrEmail ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * The account menu, and the only permanent way into the help sheet.
 *
 * The contacts and the sheet live here rather than being threaded through as
 * props, because this menu is rendered by eight pages and passing the same two
 * things into all eight is eight places for them to drift apart. The sheet is
 * the same on every one of them.
 */
export default function UserMenu({ user, logout, label, accountLabel }) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { support } = useAuth();
  const t = useT();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="avatar-button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user?.display_name ?? user?.email ?? 'User menu'}
        onClick={() => setOpen((value) => !value)}
      >
        {initials(user?.display_name ?? user?.email)}
      </button>
      {open && (
        <div className="user-menu-popover" role="menu">
          <div className="user-menu-identity">
            <strong>{user?.display_name}</strong>
            <span>{user?.email}</span>
          </div>
          {accountLabel && (
            <Link to="/account" role="menuitem" onClick={() => setOpen(false)}>
              {accountLabel}
            </Link>
          )}
          {/* Above sign out, because it is the thing somebody opens this menu
              to find when they are stuck — and sign out is the thing they open
              it to find when they are done. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setHelpOpen(true);
            }}
          >
            {t.help.menuLink}
          </button>
          <button type="button" role="menuitem" onClick={logout}>
            {label}
          </button>
        </div>
      )}
      {helpOpen && <HelpSheet support={support} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
