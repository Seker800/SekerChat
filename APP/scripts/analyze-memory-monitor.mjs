import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIB = 1024 * 1024;

export function parseMemoryCsv(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error('监控 CSV 没有数据行。');
  const headers = lines[0].split(',');
  const required = ['timestamp_epoch', 'host_mem_available_kib', 'backend_mem_bytes'];
  for (const name of required) {
    if (!headers.includes(name)) throw new Error(`监控 CSV 缺少字段：${name}`);
  }
  return lines.slice(1).map((line, rowIndex) => {
    const values = line.split(',');
    if (values.length !== headers.length)
      throw new Error(`监控 CSV 第 ${rowIndex + 2} 行字段数不正确。`);
    return Object.fromEntries(
      headers.map((name, index) => [name, parseValue(name, values[index])]),
    );
  });
}

function parseValue(name, value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (name === 'timestamp_iso' || name.endsWith('_health')) return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export function summarizeMemorySamples(inputSamples) {
  const samples = [...inputSamples].sort(
    (left, right) => left.timestamp_epoch - right.timestamp_epoch,
  );
  if (samples.length === 0) throw new Error('没有可以分析的监控样本。');
  const first = samples[0];
  const last = samples.at(-1);
  const durationHours = Math.max(0, (last.timestamp_epoch - first.timestamp_epoch) / 3600);
  const backend = summarizeComponent(samples, 'backend');
  const availableMiB = samples.map((sample) => sample.host_mem_available_kib / 1024);
  const swapMiB = samples.map((sample) => sample.host_swap_used_kib / 1024);
  const findings = [];
  let severity = 0;

  const oomDetected = samples.some((sample) => sample.backend_oom_killed);
  if (oomDetected) {
    findings.push('检测到容器被 OOM 杀死。');
    severity = 2;
  }
  if (backend.restartDelta > 0) {
    findings.push(`监控期间 backend 发生 ${backend.restartDelta} 次重启。`);
    severity = Math.max(severity, 2);
  }
  if (backend.maxMiB >= 480) {
    findings.push(`backend 峰值 ${format(backend.maxMiB)} MiB，已经逼近 512 MiB 上限。`);
    severity = Math.max(severity, 2);
  } else if (backend.maxMiB >= 420) {
    findings.push(`backend 峰值 ${format(backend.maxMiB)} MiB，内存余量偏低。`);
    severity = Math.max(severity, 1);
  }
  if (backend.growthMiB > 50 && backend.growthMiBPerHour > 2) {
    findings.push(
      `backend 持续增长 ${format(backend.growthMiB)} MiB（约 ${format(backend.growthMiBPerHour)} MiB/小时）。`,
    );
    severity = Math.max(severity, 1);
  }
  const minAvailableMiB = Math.min(...availableMiB);
  if (minAvailableMiB < 300) {
    findings.push(`群晖最低可用内存只有 ${format(minAvailableMiB)} MiB。`);
    severity = Math.max(severity, 2);
  } else if (minAvailableMiB < 600) {
    findings.push(`群晖最低可用内存为 ${format(minAvailableMiB)} MiB，余量偏低。`);
    severity = Math.max(severity, 1);
  }
  const swapGrowthMiB = swapMiB.at(-1) - swapMiB[0];
  const swapOutDeltaPages = last.host_pswpout_pages - first.host_pswpout_pages;
  if (swapGrowthMiB > 256 || swapOutDeltaPages > 131072) {
    findings.push(
      `监控期间 swap 增加 ${format(swapGrowthMiB)} MiB，换出页增加 ${Math.max(0, swapOutDeltaPages)}。`,
    );
    severity = Math.max(severity, 1);
  }
  if (findings.length === 0) findings.push('没有发现明显的持续增长、OOM 或主机内存压力。');

  return {
    status: ['healthy', 'warning', 'critical'][severity],
    sampleCount: samples.length,
    durationHours,
    firstTimestamp: first.timestamp_iso,
    lastTimestamp: last.timestamp_iso,
    backend,
    host: {
      minAvailableMiB,
      firstAvailableMiB: availableMiB[0],
      lastAvailableMiB: availableMiB.at(-1),
      firstSwapUsedMiB: swapMiB[0],
      lastSwapUsedMiB: swapMiB.at(-1),
      swapGrowthMiB,
      swapInDeltaPages: Math.max(0, last.host_pswpin_pages - first.host_pswpin_pages),
      swapOutDeltaPages: Math.max(0, swapOutDeltaPages),
    },
    findings,
  };
}

function summarizeComponent(samples, prefix) {
  const present = samples.filter(
    (sample) => sample[`${prefix}_exists`] && sample[`${prefix}_mem_bytes`] > 0,
  );
  if (present.length === 0) {
    return {
      sampleCount: 0,
      firstMiB: 0,
      lastMiB: 0,
      minMiB: 0,
      maxMiB: 0,
      growthMiB: 0,
      growthMiBPerHour: 0,
      restartDelta: 0,
    };
  }
  const values = present.map((sample) => sample[`${prefix}_mem_bytes`] / MIB);
  const elapsedHours = Math.max(
    0,
    (present.at(-1).timestamp_epoch - present[0].timestamp_epoch) / 3600,
  );
  const growthMiB = values.at(-1) - values[0];
  return {
    sampleCount: present.length,
    firstMiB: values[0],
    lastMiB: values.at(-1),
    minMiB: Math.min(...values),
    maxMiB: Math.max(...values),
    growthMiB,
    growthMiBPerHour: elapsedHours > 0 ? growthMiB / elapsedHours : 0,
    restartDelta: Math.max(
      0,
      present.at(-1)[`${prefix}_restart_count`] - present[0][`${prefix}_restart_count`],
    ),
  };
}

export function renderMemoryReport(summary, sources) {
  return `# SekerChat 生产内存监控报告

- 结论：**${statusLabel(summary.status)}**
- 样本：${summary.sampleCount} 条，跨度 ${format(summary.durationHours)} 小时
- 时间：${summary.firstTimestamp} → ${summary.lastTimestamp}
- 来源：${sources.map((source) => `\`${basename(source)}\``).join('、')}

## 关键指标

| 指标 | 起始 | 结束 | 峰值/最低 | 变化 |
|---|---:|---:|---:|---:|
| backend | ${format(summary.backend.firstMiB)} MiB | ${format(summary.backend.lastMiB)} MiB | 峰值 ${format(summary.backend.maxMiB)} MiB | ${signed(summary.backend.growthMiB)} MiB |
| 群晖可用内存 | ${format(summary.host.firstAvailableMiB)} MiB | ${format(summary.host.lastAvailableMiB)} MiB | 最低 ${format(summary.host.minAvailableMiB)} MiB | ${signed(summary.host.lastAvailableMiB - summary.host.firstAvailableMiB)} MiB |
| swap 使用 | ${format(summary.host.firstSwapUsedMiB)} MiB | ${format(summary.host.lastSwapUsedMiB)} MiB | — | ${signed(summary.host.swapGrowthMiB)} MiB |

## 判断

${summary.findings.map((finding) => `- ${finding}`).join('\n')}

> swap 的历史占用不会立刻归零；判断压力时，应同时看 swap 增量和换入/换出页变化。
`;
}

export function renderMemorySvg(samples) {
  const sorted = [...samples].sort((left, right) => left.timestamp_epoch - right.timestamp_epoch);
  const width = 1200;
  const height = 680;
  const left = 80;
  const right = 40;
  const top = 70;
  const panelHeight = 220;
  const chartWidth = width - left - right;
  const firstTime = sorted[0].timestamp_epoch;
  const lastTime = sorted.at(-1).timestamp_epoch;
  const x = (sample) =>
    left + ((sample.timestamp_epoch - firstTime) / Math.max(1, lastTime - firstTime)) * chartWidth;
  const memorySeries = [
    {
      label: 'backend',
      color: '#ef4444',
      values: sorted.map((sample) => sample.backend_mem_bytes / MIB),
    },
    {
      label: 'host available',
      color: '#22c55e',
      values: sorted.map((sample) => sample.host_mem_available_kib / 1024),
    },
  ];
  const swapSeries = sorted.map((sample) => sample.host_swap_used_kib / 1024);
  const maxMemory = Math.max(512, ...memorySeries.flatMap((series) => series.values));
  const maxSwap = Math.max(512, ...swapSeries);
  const polyline = (values, panelTop, maxValue) =>
    values
      .map(
        (value, index) =>
          `${x(sorted[index]).toFixed(1)},${(panelTop + panelHeight - (value / maxValue) * panelHeight).toFixed(1)}`,
      )
      .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#0f172a"/>
<text x="${left}" y="36" fill="#f8fafc" font-family="sans-serif" font-size="24">SekerChat production memory</text>
<text x="${left}" y="60" fill="#94a3b8" font-family="sans-serif" font-size="14">${escapeXml(sorted[0].timestamp_iso)} → ${escapeXml(sorted.at(-1).timestamp_iso)}</text>
${grid(left, top, chartWidth, panelHeight, maxMemory, 'Memory (MiB)')}
${memorySeries.map((series) => `<polyline fill="none" stroke="${series.color}" stroke-width="3" points="${polyline(series.values, top, maxMemory)}"/><text x="${left + memorySeries.indexOf(series) * 170}" y="${top + panelHeight + 30}" fill="${series.color}" font-family="sans-serif" font-size="14">${series.label}</text>`).join('\n')}
${grid(left, top + 330, chartWidth, panelHeight, maxSwap, 'Swap used (MiB)')}
<polyline fill="none" stroke="#60a5fa" stroke-width="3" points="${polyline(swapSeries, top + 330, maxSwap)}"/>
</svg>`;
}

function grid(left, top, width, height, maxValue, label) {
  const lines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = top + height - ratio * height;
      return `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#334155"/><text x="${left - 12}" y="${y + 5}" text-anchor="end" fill="#94a3b8" font-family="sans-serif" font-size="12">${Math.round(maxValue * ratio)}</text>`;
    })
    .join('\n');
  return `${lines}<text x="${left}" y="${top - 14}" fill="#cbd5e1" font-family="sans-serif" font-size="15">${label}</text>`;
}

function statusLabel(status) {
  return { healthy: '正常', warning: '需要观察', critical: '高风险' }[status] ?? status;
}

function format(value) {
  return Number(value || 0).toFixed(1);
}

function signed(value) {
  return `${value >= 0 ? '+' : ''}${format(value)}`;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function runCli() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output-dir');
  const outputDir = resolve(outputIndex >= 0 ? args[outputIndex + 1] : 'memory-monitor-report');
  const sources = args.filter(
    (argument, index) => argument !== '--output-dir' && index !== outputIndex + 1,
  );
  if (sources.length === 0) {
    console.error('Usage: node scripts/analyze-memory-monitor.mjs <csv...> [--output-dir path]');
    process.exit(2);
  }
  const samples = sources.flatMap((source) =>
    parseMemoryCsv(readFileSync(resolve(source), 'utf8')),
  );
  const summary = summarizeMemorySamples(samples);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'memory-report.md'), renderMemoryReport(summary, sources));
  writeFileSync(resolve(outputDir, 'memory-trend.svg'), renderMemorySvg(samples));
  writeFileSync(resolve(outputDir, 'memory-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Memory report created: ${outputDir}`);
  if (summary.status === 'critical') process.exitCode = 2;
  else if (summary.status === 'warning') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
