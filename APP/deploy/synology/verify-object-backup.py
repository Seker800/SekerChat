#!/usr/bin/env python3
"""Capture or verify a backup's size/hash manifest without trusting object paths."""
import hashlib
import json
import sys
from pathlib import Path


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def checked_path(root, key):
    if not isinstance(key, str) or not key or Path(key).is_absolute():
        raise ValueError('Invalid backup object key')
    path = (root / key).resolve()
    path.relative_to(root.resolve())
    if not path.is_file() or path.is_symlink():
        raise ValueError('Missing backup object')
    return path


def main():
    mode, directory = sys.argv[1:]
    backup = Path(directory)
    root = backup / 'objects'
    if mode == 'capture':
        entries = []
        for line in (backup / 'source-manifest.jsonl').read_text().splitlines():
            item = json.loads(line)
            if item.get('status') == 'error':
                raise ValueError('Source listing failed')
            if item.get('type') != 'file':
                continue
            path = checked_path(root, item['key'])
            if path.stat().st_size != item['size']:
                raise ValueError('Backup object size differs from source manifest')
            entries.append({'key': item['key'], 'size': item['size'], 'sha256': digest(path)})
        (backup / 'sha256.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n')
    elif mode == 'verify':
        for item in json.loads((backup / 'sha256.json').read_text()):
            path = checked_path(root, item['key'])
            if path.stat().st_size != item['size'] or digest(path) != item['sha256']:
                raise ValueError('Backup checksum mismatch')
    else:
        raise ValueError('Expected capture or verify')


if __name__ == '__main__':
    main()
