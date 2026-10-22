import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UploadProgressBar } from './UploadProgressBar';

describe('UploadProgressBar feedback', () => {
  it('distinguishes bytes sent from server confirmation and exposes elapsed time', () => {
    render(
      <UploadProgressBar
        fileName="photo.jpg"
        percent={100}
        speedBytesPerSec={0}
        progress={{
          loaded: 10,
          total: 10,
          percent: 100,
          speedBytesPerSec: 0,
          completedParts: 0,
          totalParts: 1,
          elapsedSeconds: 12,
          stage: 'uploading',
        }}
      />,
    );
    expect(screen.getByText(/等待服务器确认/)).toBeInTheDocument();
    expect(screen.getByText(/已用时 12 秒/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
  it('shows retry attempts and completed part counts', () => {
    render(
      <UploadProgressBar
        fileName="photo.jpg"
        percent={30}
        speedBytesPerSec={1024}
        progress={{
          loaded: 3,
          total: 10,
          percent: 30,
          speedBytesPerSec: 1024,
          completedParts: 1,
          totalParts: 4,
          retryAttempt: 2,
          elapsedSeconds: 45,
          stage: 'retrying',
        }}
      />,
    );
    expect(screen.getByText(/重试第 2 次/)).toBeInTheDocument();
    expect(screen.getByText(/已确认 1\/4/)).toBeInTheDocument();
  });
});
