import { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Type-to-filter select.
 *
 * A plain `<select>` stops being usable once the list is long — a school with
 * 300 students gives a teacher a 300-row dropdown to scroll. This keeps the
 * same shape (label above, one value out) but lets them type to narrow it.
 *
 * Follows the ARIA combobox pattern: the input owns `role="combobox"`, the
 * popup is a `listbox`, and the active option is pointed at by
 * `aria-activedescendant` rather than by moving focus — so the caret stays in
 * the input while the arrow keys walk the list.
 *
 * Props:
 *   options    [{ value, label }]  — `value: ''` is reserved for the "all" row
 *   value      currently selected value
 *   onChange   (value) => void
 *   label      visible field label
 *   allLabel   label for the reset row, rendered first
 *   placeholder / noResults / clearLabel — localized strings
 */
export default function Combobox({
  options,
  value,
  onChange,
  label,
  allLabel,
  placeholder = '',
  noResults = 'No matches',
  clearLabel = 'Clear',
  minWidth = 220,
}) {
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const rows = useMemo(
    () => [{ value: '', label: allLabel }, ...options],
    [options, allLabel]
  );

  const selected = rows.find((o) => o.value === value) ?? rows[0];

  // While closed the input shows the selection; while open it shows what the
  // user is typing, so they are never editing a value they did not enter.
  const shown = open ? query : selected.label;

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!open || q === '') return rows;
    return rows.filter((o) => o.label.toLocaleLowerCase().includes(q));
  }, [rows, query, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) close();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the highlighted row in view when walking the list with the keyboard.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function openList() {
    setQuery('');
    setActive(Math.max(0, rows.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  function commit(option) {
    if (!option) return;
    onChange(option.value);
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { openList(); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = active + step;
      if (matches.length) {
        setActive((next + matches.length) % matches.length);
      }
      return;
    }
    if (event.key === 'Home' && open) { event.preventDefault(); setActive(0); return; }
    if (event.key === 'End' && open) { event.preventDefault(); setActive(matches.length - 1); return; }
    if (event.key === 'Enter') {
      if (open) { event.preventDefault(); commit(matches[active]); }
      return;
    }
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); close(); }
      return;
    }
    if (event.key === 'Tab' && open) close();
  }

  return (
    <div className="combobox" ref={rootRef} style={{ minWidth }}>
      <label className="combobox-label" htmlFor={`${id}-input`}>{label}</label>
      <div className="combobox-control">
        <input
          id={`${id}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-opt-${active}` : undefined}
          placeholder={placeholder}
          value={shown}
          onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
          onFocus={() => { if (!open) openList(); }}
          onKeyDown={onKeyDown}
        />
        {value !== '' && (
          <button
            type="button"
            className="combobox-clear"
            aria-label={clearLabel}
            onClick={() => { onChange(''); close(); inputRef.current?.focus(); }}
          >
            ×
          </button>
        )}
        <span className="combobox-arrow" aria-hidden="true" />
      </div>

      {open && (
        <ul className="combobox-list" id={listId} role="listbox" ref={listRef}>
          {matches.length === 0 && <li className="combobox-empty">{noResults}</li>}
          {matches.map((option, index) => (
            <li
              key={option.value || '__all__'}
              id={`${id}-opt-${index}`}
              data-index={index}
              role="option"
              aria-selected={option.value === value}
              className={
                `combobox-option${index === active ? ' is-active' : ''}` +
                `${option.value === value ? ' is-selected' : ''}` +
                `${option.value === '' ? ' is-all' : ''}`
              }
              // pointerdown, not click: mousedown would blur the input first and
              // the outside-click handler would close the list before the click.
              onPointerDown={(e) => { e.preventDefault(); commit(option); }}
              onMouseEnter={() => setActive(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
