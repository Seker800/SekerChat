import MarkdownIt from 'markdown-it';
import type { MessageResponse } from '../../lib/messages-files-api';
import { userDisplayName } from '../../lib/users-api';

const COMPACT_MESSAGE_WINDOW_MS = 5 * 60 * 1000;
const MENTION_TOKEN_MATCHER = /(^|[^@\w])@([^\s@]{1,100})/g;
const SELF_MENTION_HIGHLIGHT_ATTR = 'data-mention-highlight';
const SELF_MENTION_HIGHLIGHT_VALUE = 'self';
const EXCLUDED_MENTION_HIGHLIGHT_ANCESTORS = new Set(['CODE', 'PRE']);

export const markdown = new MarkdownIt({ linkify: true, breaks: true, html: false });
markdown.disable(['html_block', 'html_inline']);

const defaultLinkOpen = markdown.renderer.rules.link_open ?? function (tokens: any, idx: any, options: any, _env: any, self: any) {
  return self.renderToken(tokens, idx, options);
};

markdown.renderer.rules.link_open = function (tokens: any, idx: any, options: any, env: any, self: any) {
  const idxToken = tokens[idx];
  if (!idxToken) {
    return defaultLinkOpen(tokens, idx, options, env, self);
  }

  const existingRel = idxToken.attrGet('rel');
  idxToken.attrSet('rel', existingRel ? `${existingRel} noreferrer noopener` : 'noreferrer noopener');
  idxToken.attrSet('target', '_blank');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

function normalizeMentionTargets(mentionTargets: string[]): Set<string> {
  return new Set(
    mentionTargets
      .map((target) => target.trim().toLowerCase())
      .filter(Boolean),
  );
}

function shouldSkipMentionHighlight(node: Node | null): boolean {
  let current = node?.parentNode;
  while (current) {
    if (current instanceof HTMLElement && EXCLUDED_MENTION_HIGHLIGHT_ANCESTORS.has(current.tagName)) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function buildMentionHighlightFragment(
  sourceText: string,
  mentionTargets: Set<string>,
): DocumentFragment | null {
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let didHighlight = false;
  MENTION_TOKEN_MATCHER.lastIndex = 0;

  for (const match of sourceText.matchAll(MENTION_TOKEN_MATCHER)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? '';
    const token = match[2] ?? '';
    const normalizedToken = token.trim().toLowerCase();
    if (!normalizedToken || !mentionTargets.has(normalizedToken)) {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const mentionStart = matchIndex + prefix.length;
    const mentionText = fullMatch.slice(prefix.length);
    const mentionEnd = mentionStart + mentionText.length;

    fragment.append(sourceText.slice(cursor, mentionStart));
    const highlight = document.createElement('span');
    highlight.setAttribute(SELF_MENTION_HIGHLIGHT_ATTR, SELF_MENTION_HIGHLIGHT_VALUE);
    highlight.textContent = mentionText;
    fragment.append(highlight);
    cursor = mentionEnd;
    didHighlight = true;
  }

  if (!didHighlight) {
    return null;
  }

  if (cursor < sourceText.length) {
    fragment.append(sourceText.slice(cursor));
  }

  return fragment;
}

export function renderMessageHtml(
  text: string | null,
  isTextMessage: boolean,
  isMentioningCurrentUser: boolean,
  currentUserMentionTargets: string[] = [],
): string {
  if (!isTextMessage || !text) {
    return '';
  }

  const renderedHtml = markdown.render(text);
  if (!isMentioningCurrentUser || currentUserMentionTargets.length === 0) {
    return renderedHtml;
  }

  if (typeof document === 'undefined' || typeof NodeFilter === 'undefined') {
    return renderedHtml;
  }

  const mentionTargets = normalizeMentionTargets(currentUserMentionTargets);
  if (mentionTargets.size === 0) {
    return renderedHtml;
  }

  const container = document.createElement('div');
  container.innerHTML = renderedHtml;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      continue;
    }
    if (!node.textContent || shouldSkipMentionHighlight(node)) {
      continue;
    }
    textNodes.push(node);
  }

  textNodes.forEach((node) => {
    const text = node.textContent ?? '';
    const fragment = buildMentionHighlightFragment(text, mentionTargets);
    if (!fragment) {
      return;
    }
    node.replaceWith(fragment);
  });

  return container.innerHTML;
}

export function senderLabel(item: MessageResponse): string {
  return userDisplayName(item.sender);
}

export function isCompactWithPrevious(previous: MessageResponse | undefined, current: MessageResponse): boolean {
  if (!previous) return false;
  if (previous.type === 'system' || current.type === 'system') return false;
  if (previous.senderId !== current.senderId) return false;

  const previousAt = new Date(previous.createdAt).getTime();
  const currentAt = new Date(current.createdAt).getTime();

  return currentAt - previousAt < COMPACT_MESSAGE_WINDOW_MS;
}

export function isSameCalendarDay(previous: MessageResponse | undefined, current: MessageResponse): boolean {
  if (!previous) return false;

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(previous.createdAt)) ===
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(current.createdAt));
}

export function formatDayDivider(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(value));
}

export function isAttachmentMessageWithoutAttachment(item: MessageResponse): boolean {
  return (item.type === 'image' || item.type === 'file') && !item.attachment;
}

export function fallbackCopyText(text: string): boolean {
  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();

    if (selection) {
      selection.removeAllRanges();
      if (originalRange) {
        selection.addRange(originalRange);
      }
    }

    activeElement?.focus();
  }
}
