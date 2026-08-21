import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { ServerIconPickerDialog } from './ServerIconPickerDialog';

describe('ServerIconPickerDialog', () => {
  let generatedImageSource = '';

  beforeEach(() => {
    generatedImageSource = '';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['avatar'], { type: 'image/png' }));
    });
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        generatedImageSource = value;
        this.onload?.();
      }
    });
  });

  it('renders searchable icon choices and saves the selected icon as a PNG blob', async () => {
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    const onSave = async (blob: Blob) => {
      saveSpy(blob);
    };

    render(
      <ServerIconPickerDialog
        serverName="研发"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText('搜索图标'), 'code');
    await user.click(screen.getByRole('button', { name: /Code/ }));
    await user.click(screen.getByRole('button', { name: '保存图标' }));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const savedBlob = saveSpy.mock.calls[0]![0] as Blob;
    expect(savedBlob).toBeInstanceOf(Blob);
    expect(savedBlob.type).toBe('image/png');
  });

  it('generates a circular avatar background for round server rail icons', async () => {
    const user = userEvent.setup();

    render(
      <ServerIconPickerDialog
        serverName="研发"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={async () => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '保存图标' }));

    await waitFor(() => expect(generatedImageSource).toContain('data:image/svg+xml'));
    const generatedSvg = decodeURIComponent(generatedImageSource.split(',')[1] ?? '');
    expect(generatedSvg).toContain('<circle cx="128" cy="128" r="128"');
    expect(generatedSvg).not.toContain('<rect width="256" height="256" rx="64"');
  });

  it('generates a flat minimal avatar without glow overlays', async () => {
    const user = userEvent.setup();

    render(
      <ServerIconPickerDialog
        serverName="研发"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={async () => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '保存图标' }));

    await waitFor(() => expect(generatedImageSource).toContain('data:image/svg+xml'));
    const generatedSvg = decodeURIComponent(generatedImageSource.split(',')[1] ?? '');
    expect(generatedSvg).not.toContain('radialGradient');
    expect(generatedSvg).not.toContain('url(#glow)');
    expect(generatedSvg).not.toContain('rgba(255,255,255');
  });

  it('uses black as the default avatar background', async () => {
    const user = userEvent.setup();

    render(
      <ServerIconPickerDialog
        serverName="研发"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={async () => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '保存图标' }));

    await waitFor(() => expect(generatedImageSource).toContain('data:image/svg+xml'));
    const generatedSvg = decodeURIComponent(generatedImageSource.split(',')[1] ?? '');
    expect(generatedSvg).toContain('<circle cx="128" cy="128" r="128" fill="#000000"');
  });

  it('deduplicates repeated icon visuals while preserving search aliases and escaping the title', async () => {
    const user = userEvent.setup();

    render(
      <ServerIconPickerDialog
        serverName={'研发 & 测试 <A>'}
        isSaving={false}
        onCancel={vi.fn()}
        onSave={async () => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '选择 Diamond 图标' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '选择 Circle Check 图标' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '选择 Paintbrush Vertical 图标' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '选择 Clapperboard 图标' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('搜索图标'), 'diamond');
    expect(screen.getByRole('button', { name: '选择 Gem 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), 'circle check');
    expect(screen.getByRole('button', { name: '选择 Badge Check 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), 'vertical');
    expect(screen.getAllByRole('button', { name: '选择 Paintbrush 图标' }).length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), 'clapperboard');
    expect(screen.getByRole('button', { name: '选择 Film 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.click(screen.getByRole('button', { name: '保存图标' }));

    await waitFor(() => expect(generatedImageSource).toContain('data:image/svg+xml'));
    const generatedSvg = decodeURIComponent(generatedImageSource.split(',')[1] ?? '');
    expect(generatedSvg).toContain('<title>研发 &amp; 测试 &lt;A&gt;</title>');
  });

  it('offers a game art studio focused searchable icon catalog', async () => {
    const user = userEvent.setup();

    render(
      <ServerIconPickerDialog
        serverName="研发"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={async () => undefined}
      />,
    );

    expect(screen.getAllByRole('button', { name: /选择 .* 图标/ }).length).toBeGreaterThanOrEqual(95);

    await user.type(screen.getByLabelText('搜索图标'), '角色');
    expect(screen.getByRole('button', { name: '选择 User 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), '场景');
    expect(screen.getByRole('button', { name: '选择 Mountain 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), '特效');
    expect(screen.getByRole('button', { name: '选择 Sparkles 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), '审核');
    expect(screen.getByRole('button', { name: '选择 Badge Check 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), '中国结');
    expect(screen.getByRole('button', { name: '选择 Chinese Knot 图标' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索图标'));
    await user.type(screen.getByLabelText('搜索图标'), '手枪');
    expect(screen.getByRole('button', { name: '选择 Handgun 图标' })).toBeInTheDocument();
  });
});
