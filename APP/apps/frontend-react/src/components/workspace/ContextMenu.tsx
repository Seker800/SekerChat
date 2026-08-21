import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export interface ContextMenuItem {
  key: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  header?: boolean;
  separatorBefore?: boolean;
  subItems?: ContextMenuItem[];
  onSelect: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

const PAD = 12;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const [subMenu, setSubMenu] = useState<{ items: ContextMenuItem[]; anchor: DOMRect } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setSubMenu(null), 180);
  }, [clearCloseTimer]);

  const closeAll = useCallback(() => {
    clearCloseTimer();
    setSubMenu(null);
    onClose();
  }, [clearCloseTimer, onClose]);

  useEffect(() => {
    if (!position) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (subRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, position]);

  if (!position || !items.length) return null;

  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const preferRight = position.x + w > window.innerWidth - PAD;
  const left = preferRight
    ? clamp(position.x - w, PAD, window.innerWidth - PAD)
    : clamp(position.x, PAD, window.innerWidth - w - PAD);
  const preferBottom = position.y + h > window.innerHeight - PAD;
  const top = preferBottom
    ? clamp(position.y - h, PAD, window.innerHeight - PAD)
    : clamp(position.y, PAD, window.innerHeight - h - PAD);

  return (
    <>
      {createPortal(
      <div
        ref={(el) => {
          menuRef.current = el;
          if (el && !size) {
            const b = el.getBoundingClientRect();
            setSize({ w: b.width, h: b.height });
          }
        }}
        className={styles.menu}
        role="menu"
        style={{
          left,
          top,
          visibility: size ? 'visible' : 'hidden',
        }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={scheduleClose}
      >
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.key}>
              {item.separatorBefore ? <div className={styles.separator} role="separator" /> : null}
              {item.header ? (
                <span className={styles.headerItem}>{item.label}</span>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={[
                    styles.item,
                    item.danger ? styles.itemDanger : '',
                    item.disabled ? styles.itemDisabled : '',
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={(e) => {
                    clearCloseTimer();
                    if (item.subItems && !item.disabled) {
                      setSubMenu({ items: item.subItems, anchor: e.currentTarget.getBoundingClientRect() });
                    } else {
                      setSubMenu(null);
                    }
                  }}
                  onClick={() => {
                    if (item.disabled || item.subItems) return;
                    item.onSelect();
                    onClose();
                  }}
                >
                  <span>{item.label}</span>
                  <span className={styles.itemRight}>
                    {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
                    {item.subItems ? <span className={styles.chevron}>›</span> : null}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      , document.body)}

      {subMenu ? (
        <SubMenu
          items={subMenu.items}
          anchor={subMenu.anchor}
          subRef={subRef}
          onCloseAll={closeAll}
          onCloseSub={scheduleClose}
          onEnterSub={clearCloseTimer}
        />
      ) : null}
    </>
  );
}

function SubMenu({
  items,
  anchor,
  subRef,
  onCloseAll,
  onCloseSub,
  onEnterSub,
}: {
  items: ContextMenuItem[];
  anchor: DOMRect;
  subRef: React.MutableRefObject<HTMLDivElement | null>;
  onCloseAll: () => void;
  onCloseSub: () => void;
  onEnterSub: () => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const preferRight = anchor.right + 6;
  const right = preferRight + w > window.innerWidth - PAD ? anchor.left - w - 6 : preferRight;
  const left = clamp(right, PAD, window.innerWidth - PAD);
  const top = clamp(anchor.top, PAD, window.innerHeight - h - PAD);

  return createPortal(
    <div
      ref={(el) => {
        subRef.current = el;
        if (el && !size) {
          const b = el.getBoundingClientRect();
          setSize({ w: b.width, h: b.height });
        }
      }}
      className={styles.menu}
      role="menu"
      style={{
        left,
        top,
        visibility: size ? 'visible' : 'hidden',
      }}
      onMouseEnter={onEnterSub}
      onMouseLeave={onCloseSub}
    >
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.key}>
            {item.separatorBefore ? <div className={styles.separator} role="separator" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={[
                styles.item,
                item.danger ? styles.itemDanger : '',
                item.disabled ? styles.itemDisabled : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                onCloseAll();
              }}
            >
              <span>{item.label}</span>
              {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
