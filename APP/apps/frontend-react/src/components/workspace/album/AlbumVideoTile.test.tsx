import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlbumVideoTile } from './AlbumVideoTile';

function VideoTileHarness() {
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  return (
    <>
      {['first', 'second'].map((id, index) => (
        <AlbumVideoTile
          key={id}
          active={activeVideoId === id}
          contentUrl={`/${id}.mp4`}
          index={index + 1}
          posterUrl={`/${id}.jpg`}
          suspended={false}
          onActivate={() => setActiveVideoId(id)}
          onDeactivate={() => setActiveVideoId((current) => (current === id ? null : current))}
        />
      ))}
    </>
  );
}

describe('AlbumVideoTile', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('delays hover playback, keeps only one active video, and releases media resources', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    render(<VideoTileHarness />);
    const first = screen.getByLabelText('相册视频 1');
    const second = screen.getByLabelText('相册视频 2');

    fireEvent.mouseEnter(first);
    act(() => vi.advanceTimersByTime(199));
    expect(first).not.toHaveAttribute('src');

    act(() => vi.advanceTimersByTime(1));
    expect(first).toHaveAttribute('src', '/first.mp4');
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.mouseEnter(second);
    act(() => vi.advanceTimersByTime(200));
    expect(first).not.toHaveAttribute('src');
    expect(second).toHaveAttribute('src', '/second.mp4');

    fireEvent.mouseLeave(second);
    expect(second).not.toHaveAttribute('src');
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });

  it('does not start a request when the pointer leaves before the hover delay', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    render(<VideoTileHarness />);
    const first = screen.getByLabelText('相册视频 1');

    fireEvent.mouseEnter(first);
    fireEvent.mouseLeave(first);
    act(() => vi.advanceTimersByTime(200));

    expect(first).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
