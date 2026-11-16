export function insertMarkdownAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  markdown: string,
) {
  const nextValue = `${value.slice(0, selectionStart)}${markdown}${value.slice(selectionEnd)}`;
  const nextCaret = selectionStart + markdown.length;
  return {
    value: nextValue,
    selectionStart: nextCaret,
    selectionEnd: nextCaret,
  };
}

export function buildAttachmentImageMarkdown(originalName: string, attachmentId: string): string {
  const alt =
    originalName
      .replace(/\.[^.]+$/u, '')
      .replace(/[\[\]]/g, '')
      .trim() || '图片';
  return `![${alt}](attachment://${attachmentId})`;
}
