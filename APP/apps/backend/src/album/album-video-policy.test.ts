import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAlbumVideoProbe } from './album-video-policy';

test('parseAlbumVideoProbe accepts browser-compatible H.264 MP4 metadata', () => {
  assert.deepEqual(
    parseAlbumVideoProbe({
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.345' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 1080,
          tags: { rotate: '90' },
        },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    }),
    { width: 1080, height: 1920, durationMs: 12_345 },
  );
});

test('parseAlbumVideoProbe rejects non-MP4, unsupported video codecs and unsupported audio', () => {
  assert.throws(
    () =>
      parseAlbumVideoProbe({
        format: { format_name: 'matroska,webm', duration: '1' },
        streams: [{ codec_type: 'video', codec_name: 'h264', width: 640, height: 360 }],
      }),
    /MP4/,
  );
  assert.throws(
    () =>
      parseAlbumVideoProbe({
        format: { format_name: 'mov,mp4', duration: '1' },
        streams: [{ codec_type: 'video', codec_name: 'hevc', width: 640, height: 360 }],
      }),
    /H\.264/,
  );
  assert.throws(
    () =>
      parseAlbumVideoProbe({
        format: { format_name: 'mov,mp4', duration: '1' },
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 640, height: 360 },
          { codec_type: 'audio', codec_name: 'opus' },
        ],
      }),
    /AAC/,
  );
});
