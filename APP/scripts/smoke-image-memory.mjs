import assert from 'node:assert/strict';
import { realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Run outside the live backend: the probe deliberately reserves API headroom.
const [image, samplePath] = process.argv.slice(2);
assert.ok(image && samplePath, 'Usage: node scripts/smoke-image-memory.mjs <image> <progressive-jpeg>');
const sample = realpathSync(samplePath);
assert.ok(statSync(sample).isFile());
const probe = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createImageProcessor } = require('./dist/src/files/image-processing-policy');
const reserve = Buffer.alloc(220 * 1024 * 1024, 1);
(async () => {
  const source = await createImageProcessor('/sample.jpg').metadata();
  assert.equal(source.isProgressive, true, 'A progressive JPEG is required');
  assert.ok(source.width * source.height >= 90_000_000, 'At least 90 megapixels required');
  for (let i = 0; i < 8; i++) {
    const filename = '/tmp/image-' + i + '.jpg';
    fs.copyFileSync('/sample.jpg', filename);
    const thumbnail = await createImageProcessor(filename).rotate()
      .resize({width:400,height:400,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:85}).toBuffer();
    fs.unlinkSync(filename);
    assert.ok(thumbnail.length > 0);
    // Allow the native pipeline to release its last reference before sampling.
    await new Promise(resolve => setTimeout(resolve, 100));
    const rss = process.memoryUsage().rss;
    console.log(JSON.stringify({iteration:i + 1, rssMiB:rss / 1048576}));
    assert.ok(rss < 420 * 1048576, 'Completed decode retains excessive native memory');
  }
  assert.equal(reserve[0], 1);
  console.log('Progressive JPEG memory acceptance passed (1 GiB, no swap, 220 MiB API reserve).');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
`;
const result = spawnSync('docker', [
  'run', '--rm', '--platform', 'linux/amd64', '--memory', '1g', '--memory-swap', '1g',
  '--cpus', '2', '--network', 'none', '--mount', `type=bind,source=${sample},target=/sample.jpg,readonly`,
  '--entrypoint', 'node', image, '-e', probe,
], { stdio: 'inherit', timeout: 180_000 });
if (result.error) throw result.error;
assert.equal(result.status, 0, `Image memory probe failed (exit ${result.status}, signal ${result.signal})`);
