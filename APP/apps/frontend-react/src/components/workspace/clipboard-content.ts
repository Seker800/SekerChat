export type ClipboardPart =
  | { kind: 'text'; text: string }
  | { kind: 'image'; source?: string; file?: File };
export type ResolvedClipboardPart = { kind: 'text'; text: string } | { kind: 'image'; file: File };

function textParts(text: string): ClipboardPart[] {
  const parts: ClipboardPart[] = [];
  let remaining = text.replace(/\u00a0/g, ' ').trim();
  // The existing message API accepts at most 10,000 UTF-16 code units.
  while (remaining) {
    let end = Math.min(10_000, remaining.length);
    if (end < remaining.length && /[\uD800-\uDBFF]/.test(remaining[end - 1]!)) end--;
    parts.push({ kind: 'text', text: remaining.slice(0, end) });
    remaining = remaining.slice(end);
  }
  return parts;
}

// Read synchronously during the paste event; browsers clear DataTransfer afterwards.
// The detached document is only traversed, never inserted into the live DOM.
export function readClipboardContent(data: DataTransfer): ClipboardPart[] | null {
  const files = Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'));
  if (!files.length) {
    for (const item of Array.from(data.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  for (let index = 0; index < files.length; index++) {
    const file = files[index]!;
    if (!file.name.trim()) {
      const extension = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
      files[index] = new File([file], `clipboard-image-${Date.now()}-${index}.${extension}`, {
        type: file.type,
      });
    }
  }
  const html = data.getData?.('text/html') ?? '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script,style,iframe,object,embed,template,noscript')
    .forEach((node) => node.remove());
  const images = Array.from(doc.body.querySelectorAll('img'));
  if (!images.length) {
    if (!files.length) return null;
    const text = data.getData?.('text/plain')?.trim();
    return [...textParts(text ?? ''), ...files.map((file) => ({ kind: 'image' as const, file }))];
  }
  const sources = [...new Set(images.map((image) => image.getAttribute('src') ?? ''))];
  const mapFiles = sources.length === files.length;
  const parts: ClipboardPart[] = [];
  let text = '';
  const flush = () => {
    parts.push(...textParts(text));
    text = '';
  };
  const blocks = new Set([
    'P',
    'DIV',
    'LI',
    'UL',
    'OL',
    'BLOCKQUOTE',
    'PRE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'TR',
  ]);
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'IMG') {
      flush();
      const source = node.getAttribute('src') ?? '';
      const file = mapFiles ? files[sources.indexOf(source)] : undefined;
      parts.push(file ? { kind: 'image', file } : { kind: 'image', source });
      return;
    }
    if (node.tagName === 'BR') {
      text += '\n';
      return;
    }
    const block = blocks.has(node.tagName);
    if (block && text && !text.endsWith('\n')) text += '\n';
    for (const child of node.childNodes) walk(child);
    if (block && text && !text.endsWith('\n')) text += '\n';
    if (node.tagName === 'TD' || node.tagName === 'TH') text += '\t';
  };
  for (const node of doc.body.childNodes) walk(node);
  flush();
  return parts;
}

export async function resolveClipboardImages(
  parts: ClipboardPart[],
  maxBytes: number,
  signal: AbortSignal,
): Promise<ResolvedClipboardPart[]> {
  const result: ResolvedClipboardPart[] = [];
  const resolved = new Map<string, File>();
  for (const part of parts) {
    signal.throwIfAborted();
    if (part.kind === 'text') {
      result.push(part);
      continue;
    }
    let file = part.file;
    if (!file && part.source) {
      file = resolved.get(part.source);
      if (!file) {
        let blob: Blob;
        const embedded = /^data:(image\/(?:png|jpeg|gif|webp|bmp));base64,([a-z0-9+/=\s]+)$/i.exec(
          part.source,
        );
        if (embedded) {
          // Decode locally: fetching a data URL would violate the app's connect-src policy.
          const encoded = embedded[2]!.replace(/\s/g, '');
          const size =
            Math.floor((encoded.length * 3) / 4) -
            (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
          if (size > maxBytes) throw new Error('剪贴板图片超过附件大小限制。');
          const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
          blob = new Blob([bytes], { type: embedded[1]!.toLowerCase() });
        } else {
          let url: URL;
          try {
            url = new URL(part.source);
          } catch {
            throw new Error('剪贴板图片地址无法读取，请重新复制。');
          }
          if (
            !['https:', 'http:', 'blob:'].includes(url.protocol) ||
            url.username ||
            url.password
          ) {
            throw new Error('剪贴板图片无法读取，请从原平台复制图片本身后重试。');
          }
          // Never attach Chat credentials or proxy arbitrary URLs through the backend.
          let response: Response;
          try {
            response = await fetch(url, {
              credentials: 'omit',
              referrerPolicy: 'no-referrer',
              signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
            });
          } catch {
            signal.throwIfAborted();
            throw new Error(
              '剪贴板图片无法读取，可能受原平台权限或跨域限制，请复制图片本身后重试。',
            );
          }
          if (!response.ok || !response.body)
            throw new Error('剪贴板图片读取失败，请从原平台复制图片本身后重试。');
          const mimeType = (response.headers.get('content-type') ?? '').split(';')[0]!;
          if (!/^image\/(png|jpeg|gif|webp|bmp|avif|heic|heif|tiff)$/i.test(mimeType)) {
            await response.body.cancel();
            throw new Error('剪贴板图片格式不受支持。');
          }
          const reader = response.body.getReader();
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          let size = 0;
          try {
            if (Number(response.headers.get('content-length')) > maxBytes)
              throw new Error('剪贴板图片超过附件大小限制。');
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > maxBytes) throw new Error('剪贴板图片超过附件大小限制。');
              chunks.push(new Uint8Array(value));
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
          blob = new Blob(chunks, { type: mimeType });
        }
        const extension = blob.type.split('/')[1]!.split(';')[0]!;
        file = new File([blob], `clipboard-image-${result.length + 1}.${extension}`, {
          type: blob.type,
        });
        resolved.set(part.source, file);
      }
    }
    if (!file) throw new Error('剪贴板图片缺少可读取的内容，请重新复制。');
    if (file.size > maxBytes) throw new Error('剪贴板图片超过附件大小限制。');
    result.push({ kind: 'image', file });
  }
  return result;
}
