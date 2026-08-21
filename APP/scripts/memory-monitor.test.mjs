import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..');

test('Synology sampler records host and SekerChat container memory', () => {
  const fixture = createCollectorFixture();
  const result = spawnSync(
    'bash',
    [resolve(appRoot, 'deploy/synology/memory-monitor.sh'), 'sample'],
    {
      cwd: appRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        SEKERCHAT_DOCKER_BIN: fixture.docker,
        SEKERCHAT_MONITOR_DIR: fixture.monitorDir,
        SEKERCHAT_PROC_MEMINFO: fixture.meminfo,
        SEKERCHAT_PROC_VMSTAT: fixture.vmstat,
        SEKERCHAT_NOW_EPOCH: '1786752000',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const csvFiles = result.stdout.trim().split('\n');
  assert.equal(csvFiles.length, 1);
  const csv = readFileSync(csvFiles[0], 'utf8');
  const [header, row] = csv.trim().split('\n');
  const fields = Object.fromEntries(
    header.split(',').map((name, index) => [name, row.split(',')[index]]),
  );

  assert.equal(fields.host_mem_available_kib, '1048576');
  assert.equal(fields.host_swap_used_kib, '1572864');
  assert.equal(fields.backend_mem_bytes, String(Math.round(462.2 * 1024 * 1024)));
  assert.equal(fields.backend_rss_kib, '426520');
  assert.equal(fields.backend_swap_kib, '256424');
  assert.equal(fields.backend_restart_count, '0');
  assert.equal(fields.backend_oom_killed, 'false');
  assert.doesNotMatch(csv, /password|secret|DATABASE_URL/i);
});

test('memory report identifies sustained backend growth and host pressure', async () => {
  const { parseMemoryCsv, renderMemoryReport, renderMemorySvg, summarizeMemorySamples } =
    await import('./analyze-memory-monitor.mjs');
  const samples =
    parseMemoryCsv(`timestamp_epoch,timestamp_iso,host_mem_available_kib,host_swap_used_kib,host_pswpin_pages,host_pswpout_pages,backend_exists,backend_mem_bytes,backend_limit_bytes,backend_rss_kib,backend_swap_kib,backend_hwm_kib,backend_restart_count,backend_oom_killed,backend_health,postgres_mem_bytes,minio_mem_bytes
1000,2026-08-15T00:00:00+0800,1048576,1048576,10,20,true,209715200,536870912,204800,0,204800,0,false,healthy,67108864,188743680
44200,2026-08-15T12:00:00+0800,250000,1572864,100,900,true,471859200,536870912,460800,262144,500000,1,true,unhealthy,73400320,199229440
`);

  const summary = summarizeMemorySamples(samples);
  assert.equal(summary.status, 'critical');
  assert.equal(summary.sampleCount, 2);
  assert.ok(summary.backend.growthMiB > 200);
  assert.ok(summary.backend.maxMiB >= 450);
  assert.ok(summary.host.minAvailableMiB < 300);
  assert.ok(summary.findings.some((finding) => finding.includes('OOM')));
  assert.ok(summary.findings.some((finding) => finding.includes('持续增长')));

  const report = renderMemoryReport(summary, ['/tmp/production-memory.csv']);
  const svg = renderMemorySvg(samples);
  assert.match(report, /结论：\*\*高风险\*\*/);
  assert.match(report, /production-memory\.csv/);
  assert.match(svg, /SekerChat production memory/);
  assert.match(svg, /backend/);
});

test('Synology monitor can start, report status, and stop cleanly', async () => {
  const fixture = createCollectorFixture();
  const script = resolve(appRoot, 'deploy/synology/memory-monitor.sh');
  const env = {
    ...process.env,
    SEKERCHAT_DOCKER_BIN: fixture.docker,
    SEKERCHAT_MONITOR_DIR: fixture.monitorDir,
    SEKERCHAT_PROC_MEMINFO: fixture.meminfo,
    SEKERCHAT_PROC_VMSTAT: fixture.vmstat,
  };
  const started = spawnSync(
    'bash',
    [script, 'start', '--duration-hours', '1', '--interval-seconds', '1'],
    {
      cwd: appRoot,
      encoding: 'utf8',
      env,
    },
  );
  assert.equal(started.status, 0, started.stderr || started.stdout);
  assert.match(started.stdout, /Memory monitor started/);

  const status = spawnSync('bash', [script, 'status'], { cwd: appRoot, encoding: 'utf8', env });
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /^running pid=/);
  assert.ok(existsSync(join(fixture.monitorDir, 'memory-monitor.pid')));
  const monitorLog = readFileSync(join(fixture.monitorDir, 'logs/memory-monitor.log'), 'utf8');
  assert.equal(monitorLog.match(/Memory monitor started:/g)?.length, 1);

  const stopped = spawnSync('bash', [script, 'stop'], { cwd: appRoot, encoding: 'utf8', env });
  assert.equal(stopped.status, 0, stopped.stderr || stopped.stdout);
  assert.match(stopped.stdout, /stop requested/);

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1200));
  const finalStatus = spawnSync('bash', [script, 'status'], {
    cwd: appRoot,
    encoding: 'utf8',
    env,
  });
  assert.equal(finalStatus.status, 1);
  assert.match(finalStatus.stdout, /stopped/);
});

function createCollectorFixture() {
  const root = mkdtempSync(join(tmpdir(), 'sekerchat-memory-monitor-'));
  const docker = join(root, 'docker');
  const monitorDir = join(root, 'monitoring');
  const meminfo = join(root, 'meminfo');
  const vmstat = join(root, 'vmstat');

  writeFileSync(
    meminfo,
    'MemTotal:        3856384 kB\nMemAvailable:   1048576 kB\nSwapTotal:      4409344 kB\nSwapFree:       2836480 kB\n',
  );
  writeFileSync(vmstat, 'pswpin 123\npswpout 456\n');
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -eu
if [ "$1" = inspect ]; then
  container="$2"
  case "$*" in
    *HostConfig.Memory*) printf '536870912\\n' ;;
    *RestartCount*) printf '0\\n' ;;
    *State.OOMKilled*) printf 'false\\n' ;;
    *State.Health.Status*) printf 'healthy\\n' ;;
    *) exit 0 ;;
  esac
  exit 0
fi
if [ "$1" = stats ]; then
  printf 'sekerchat-backend|462.2MiB / 512MiB\\n'
  printf 'sekerchat-postgres|66MiB / 3.7GiB\\n'
  printf 'sekerchat-minio|180MiB / 3.7GiB\\n'
  exit 0
fi
if [ "$1" = exec ] && [ "$2" = sekerchat-backend ]; then
  printf 'VmHWM:\\t  502504 kB\\nVmRSS:\\t  426520 kB\\nVmSwap:\\t  256424 kB\\n'
  exit 0
fi
exit 1
`,
  );
  chmodSync(docker, 0o755);
  return { docker, monitorDir, meminfo, vmstat };
}
