import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { MentionSuggestion } from './useComposer';
import styles from './Composer.module.css';

interface MentionDropdownProps {
  suggestions: MentionSuggestion[];
  activeIndex: number;
  onSelect: (member: MentionSuggestion) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function MentionDropdown(props: MentionDropdownProps) {
  if (!props.suggestions.length) return null;
  if (props.anchorRef) return <AnchoredMentionDropdown {...props} anchorRef={props.anchorRef} />;
  return (
    <div className={styles.mentionDropdown} data-testid="mention-dropdown">
      <MentionChoices {...props} />
    </div>
  );
}

function MentionChoices({ suggestions, activeIndex, onSelect }: MentionDropdownProps) {
  return (
    <>
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.userId}
          className={`${styles.mentionItem} ${index === activeIndex ? styles.mentionItemActive : ''}`}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(suggestion);
          }}
        >
          <span className={styles.mentionName}>{suggestion.displayName}</span>
          <span className={styles.mentionEmail}>{suggestion.email}</span>
        </button>
      ))}
    </>
  );
}

/** Use the same portal boundary as context menus so message scrolling cannot clip choices. */
function AnchoredMentionDropdown({
  anchorRef,
  suggestions,
  activeIndex,
  onSelect,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  suggestions: MentionSuggestion[];
  activeIndex: number;
  onSelect: (member: MentionSuggestion) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 220, maxHeight: 240 });
  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect();
      const above = Math.max(0, rect.top - 12);
      const below = Math.max(0, window.innerHeight - rect.bottom - 12);
      const height = Math.min(240, menu.scrollHeight);
      const opensBelow = below >= height || below >= above;
      const maxHeight = Math.min(240, opensBelow ? below : above);
      const width = Math.min(Math.max(220, rect.width), window.innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: opensBelow ? rect.bottom + 4 : rect.top - Math.min(height, maxHeight) - 4,
        width,
        maxHeight,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new ResizeObserver(update);
    if (anchorRef.current) observer.observe(anchorRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer.disconnect();
    };
  }, [anchorRef, suggestions.length]);
  useLayoutEffect(() => {
    const choice = menuRef.current?.querySelectorAll('button').item(activeIndex);
    choice?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', bottom: 'auto', margin: 0, ...position }}
      className={styles.mentionDropdown}
      data-testid="mention-dropdown"
    >
      <MentionChoices suggestions={suggestions} activeIndex={activeIndex} onSelect={onSelect} />
    </div>,
    document.body,
  );
}
