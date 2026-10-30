import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMentionCompletion, type MentionMember } from './useMentionCompletion';
import { MentionDropdown } from './MentionDropdown';
import styles from './MessagePane.module.css';

export function MessageEditor({
  text,
  members,
  onChange,
  onSave,
  onCancel,
}: {
  text: string;
  members?: MentionMember[];
  onChange: (text: string) => void;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [caret, setCaret] = useState(text.length);
  const mention = useMentionCompletion(text, members, onChange, caret);
  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      setCaret(pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);
  const select: typeof mention.select = (member) => {
    const nextCaret = mention.select(member);
    pendingCaret.current = nextCaret;
    return nextCaret;
  };
  return (
    <div className={styles.editArea}>
      <textarea
        ref={inputRef}
        className={styles.editInput}
        value={text}
        onChange={(event) => {
          setCaret(event.target.selectionStart);
          onChange(event.target.value);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            event.stopPropagation();
            return;
          }
          if (mention.suggestions.length) {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              mention.navigate(event.key === 'ArrowUp' ? 'up' : 'down');
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              select(mention.suggestions[mention.activeIndex]!);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              mention.dismiss();
              return;
            }
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (text.trim()) onSave(text.trim());
          }
          if (event.key === 'Escape') onCancel();
        }}
        autoFocus
        rows={3}
      />
      <MentionDropdown
        anchorRef={inputRef}
        suggestions={mention.suggestions}
        activeIndex={mention.activeIndex}
        onSelect={select}
      />
      <div className={styles.editHint}>{t('messages.editHint')}</div>
    </div>
  );
}
