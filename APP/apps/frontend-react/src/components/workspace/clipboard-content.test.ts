import { afterEach, describe, expect, it, vi } from 'vitest';
import { readClipboardContent, resolveClipboardImages } from './clipboard-content';

function clipboard(html: string, files: File[] = [], text = '') {
  return {
    files,
    items: [],
    getData: (type: string) => (type === 'text/html' ? html : text),
  } as unknown as DataTransfer;
}

describe('rich clipboard content', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('preserves text/image order, paragraphs, and repeated images without executing HTML', () => {
    expect(
      readClipboardContent(
        clipboard(
          '<p>第一段<br>第二行</p><img src="https://example.com/a.png"><div>中间</div><img src="https://example.com/a.png"><p>结尾</p><script>bad()</script>',
        ),
      ),
    ).toEqual([
      { kind: 'text', text: '第一段\n第二行' },
      { kind: 'image', source: 'https://example.com/a.png' },
      { kind: 'text', text: '中间' },
      { kind: 'image', source: 'https://example.com/a.png' },
      { kind: 'text', text: '结尾' },
    ]);
  });

  it('uses clipboard files for local references when the mapping is unambiguous', () => {
    const file = new File(['image'], 'a.png', { type: 'image/png' });
    expect(
      readClipboardContent(clipboard('<p>文字</p><img src="file:///private/a.png">', [file])),
    ).toEqual([
      { kind: 'text', text: '文字' },
      { kind: 'image', file },
    ]);
  });

  it('leaves text-only pastes alone and keeps plain text alongside image files', () => {
    expect(readClipboardContent(clipboard('<b>hello</b>'))).toBeNull();
    const file = new File(['image'], 'a.png', { type: 'image/png' });
    expect(readClipboardContent(clipboard('', [file], 'caption'))).toEqual([
      { kind: 'text', text: 'caption' },
      { kind: 'image', file },
    ]);
  });

  it('rejects unreadable references explicitly instead of losing images', async () => {
    await expect(
      resolveClipboardImages(
        [{ kind: 'image', source: 'file:///private/image.png' }],
        1000,
        new AbortController().signal,
      ),
    ).rejects.toThrow('图片');
  });

  it('resolves embedded images and enforces the attachment limit', async () => {
    const parts = [{ kind: 'image' as const, source: 'data:image/png;base64,aGVsbG8=' }];
    expect(await resolveClipboardImages(parts, 100, new AbortController().signal)).toMatchObject([
      { kind: 'image', file: expect.any(File) },
    ]);
    await expect(resolveClipboardImages(parts, 1, new AbortController().signal)).rejects.toThrow(
      '限制',
    );
  });
  it('splits long text within the existing API limit without breaking emoji', () => {
    const parts = readClipboardContent(clipboard(`<p>${'a'.repeat(9999)}😀end</p><img src="x">`))!;
    expect(parts[0]).toEqual({ kind: 'text', text: 'a'.repeat(9999) });
    expect(parts[1]).toEqual({ kind: 'text', text: '😀end' });
  });

  it('reads remote images without credentials and rejects oversized streams', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response('hello', { headers: { 'content-type': 'image/png' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const parts = [{ kind: 'image' as const, source: 'https://example.com/image.png' }];
    const result = await resolveClipboardImages(parts, 10, new AbortController().signal);
    expect(result[0]).toMatchObject({ file: expect.any(File) });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    await expect(resolveClipboardImages(parts, 1, new AbortController().signal)).rejects.toThrow(
      '限制',
    );
  });

  it('explains CORS failures and rejects non-images, unsafe schemes and credential URLs', async () => {
    const parts = [{ kind: 'image' as const, source: 'https://example.com/image.png' }];
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(resolveClipboardImages(parts, 100, new AbortController().signal)).rejects.toThrow(
      '跨域',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('html', { headers: { 'content-type': 'text/html' } })),
    );
    await expect(resolveClipboardImages(parts, 100, new AbortController().signal)).rejects.toThrow(
      '格式',
    );
    for (const source of [
      'javascript:alert(1)',
      'https://user:password@example.com/a.png',
      'relative.png',
      '',
    ]) {
      await expect(
        resolveClipboardImages([{ kind: 'image', source }], 100, new AbortController().signal),
      ).rejects.toThrow('图片');
    }
  });

  it('reuses downloaded bytes for repeated references and respects abort', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('hello', { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    const part = { kind: 'image' as const, source: 'https://example.com/image.png' };
    expect(
      await resolveClipboardImages([part, part], 100, new AbortController().signal),
    ).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await expect(resolveClipboardImages([part], 100, controller.signal)).rejects.toThrow();
  });

  it('gives unnamed clipboard files uploadable names and supports item-only files', () => {
    const file = new File(['image'], '', { type: 'image/png' });
    const data = {
      files: [],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      getData: () => '',
    } as unknown as DataTransfer;
    expect(readClipboardContent(data)).toMatchObject([
      {
        kind: 'image',
        file: expect.objectContaining({ name: expect.stringMatching(/^clipboard-image-.*\.png$/) }),
      },
    ]);
  });

  it('rejects HTTP errors and advertised oversized images', async () => {
    const parts = [{ kind: 'image' as const, source: 'https://example.com/image.png' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('denied', { status: 403 })));
    await expect(resolveClipboardImages(parts, 100, new AbortController().signal)).rejects.toThrow(
      '读取失败',
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('image', {
            headers: { 'content-type': 'image/png', 'content-length': '200' },
          }),
        ),
    );
    await expect(resolveClipboardImages(parts, 100, new AbortController().signal)).rejects.toThrow(
      '限制',
    );
  });
});
