import { useEffect, useMemo, useState } from 'react';

export interface MentionMember {
  userId: string;
  displayName: string | null;
  email: string;
}

/** Shared text-based mention completion for drafts and message edits. */
export function useMentionCompletion(
  text: string,
  members: MentionMember[] | undefined,
  onChange: (text: string) => void,
  caret = text.length,
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const query = useMemo(() => {
    const prefix = text.slice(0, caret);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(prefix);
    return match ? { value: match[1]!, start: caret - match[1]!.length - 1 } : null;
  }, [text, caret]);
  const suggestions = useMemo(() => {
    if (!query || dismissed) return [];
    const search = query.value.toLowerCase();
    return (members ?? [])
      .filter(
        (member) =>
          (member.displayName || member.email).toLowerCase().includes(search) ||
          member.email.toLowerCase().includes(search),
      )
      .slice(0, 8)
      .map((member) => ({ ...member, displayName: member.displayName || member.email }));
  }, [members, query, dismissed]);
  useEffect(() => {
    setActiveIndex(0);
    setDismissed(false);
  }, [text, caret]);
  const replace = (replacement: string) => {
    if (!query) return caret;
    onChange(text.slice(0, query.start) + replacement + text.slice(caret));
    return query.start + replacement.length;
  };
  return {
    suggestions,
    activeIndex: Math.min(activeIndex, Math.max(0, suggestions.length - 1)),
    navigate: (direction: 'up' | 'down') =>
      setActiveIndex(
        (index) =>
          (index + (direction === 'up' ? -1 : 1) + suggestions.length) % suggestions.length,
      ),
    select: (member: MentionMember) => {
      const label = member.displayName?.trim() || member.email;
      const normalized = label.toLowerCase();
      const isAmbiguous = (members ?? []).some(
        (other) =>
          other.userId !== member.userId &&
          [
            other.displayName?.trim().toLowerCase(),
            other.email.toLowerCase(),
            other.email.split('@')[0]?.toLowerCase(),
          ].includes(normalized),
      );
      const token = /[\s@]/.test(label) || isAmbiguous ? member.email : label;
      return replace(`@${token} `);
    },
    dismiss: () => setDismissed(true),
    replace,
  };
}
