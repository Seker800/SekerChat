import { describe, expect, it } from 'vitest';
import {
  buildAttachmentImageMarkdown,
  insertMarkdownAtSelection,
  parseSubscriptionTags,
} from './subscription-editor-utils';

describe('subscription editor helpers', () => {
  it('creates deduplicated tags from enter, spaces, and Chinese or English commas', () => {
    expect(parseSubscriptionTags('更新, 桌面端，公告  教程', ['已有', '更新'])).toEqual([
      '已有',
      '更新',
      '桌面端',
      '公告',
      '教程',
    ]);
  });

  it('inserts markdown at the current selection and returns the new caret', () => {
    expect(insertMarkdownAtSelection('前后', 1, 1, '**重点**')).toEqual({
      value: '前**重点**后',
      selectionStart: 7,
      selectionEnd: 7,
    });
  });

  it('builds a stable attachment image reference rather than a temporary URL', () => {
    expect(buildAttachmentImageMarkdown('界面 截图.png', 'attachment-1')).toBe(
      '![界面 截图](attachment://attachment-1)',
    );
  });
});
