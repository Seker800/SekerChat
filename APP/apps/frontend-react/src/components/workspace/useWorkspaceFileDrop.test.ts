import { describe, expect, it } from 'vitest';
import { hasDraggedFiles, isLocallyOwnedFileDrop } from './useWorkspaceFileDrop';

describe('hasDraggedFiles', () => {
  it('accepts native file drags and rejects text drags', () => {
    expect(hasDraggedFiles({ types: ['Files'] })).toBe(true);
    expect(hasDraggedFiles({ types: ['text/plain'] })).toBe(false);
    expect(hasDraggedFiles(null)).toBe(false);
  });

  it('lets nested editors own their file drop interaction', () => {
    const editor = document.createElement('div');
    editor.dataset.workspaceFileDrop = 'local';
    const child = document.createElement('span');
    editor.appendChild(child);

    expect(isLocallyOwnedFileDrop(child)).toBe(true);
    expect(isLocallyOwnedFileDrop(document.body)).toBe(false);
  });
});
