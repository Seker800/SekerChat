#!/usr/bin/env node

import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reminderDistPath = resolve(projectRoot, 'apps/reminder/dist/index.js');
const defaultApiBaseUrl = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3100/api';
const defaultReminderEmail = process.env.SMOKE_REMINDER_EMAIL ?? 'alice@example.com';
const defaultDeviceName = process.env.SMOKE_REMINDER_DEVICE_NAME ?? 'smoke-reminder-device';
const defaultTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? '8000');

function printHelp() {
  process.stdout.write(
    [
      'Reminder runtime smoke',
      '',
      'Prerequisites:',
      '  1. Backend is already running and reachable at the API base URL.',
      '  2. Reminder email can complete the email-code login fallback.',
      '  3. Reminder app has been built so apps/reminder/dist/index.js exists.',
      '',
      'Usage:',
      '  npm run smoke:reminder-runtime -- --api-base-url <url> --email <email> --device-name <name>',
      '',
      'Defaults:',
      `  --api-base-url ${defaultApiBaseUrl}`,
      `  --email ${defaultReminderEmail}`,
      `  --device-name ${defaultDeviceName}`,
      `  --timeout-ms ${defaultTimeoutMs}`,
    ].join('\n') + '\n',
  );
}

function parseArgs(argv) {
  const flags = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) {
      continue;
    }

    const key = entry.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      flags.set(key, 'true');
      continue;
    }

    flags.set(key, value);
    index += 1;
  }

  return flags;
}

function getFlag(flags, key, fallback) {
  return (flags.get(key) ?? fallback).trim();
}

function normalizeApiBaseUrl(input) {
  const url = new URL(input);
  return url.toString().replace(/\/$/, '');
}

async function ensureParentDirectory(pathname) {
  await mkdir(dirname(pathname), { recursive: true });
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function extractJsonObject(text) {
  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return JSON.parse(text.slice(startIndex, endIndex + 1));
}

async function runReminderCli(args, options = {}) {
  const { cwd = projectRoot, timeoutMs = defaultTimeoutMs, waitForMatch = null } = options;

  return withTimeout(
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [reminderDistPath, ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const finishResolve = (value) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };

      const finishReject = (error) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error);
      };

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        if (waitForMatch && waitForMatch.test(stdout)) {
          finishResolve({ child, stdout, stderr });
        }
      });

      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', (error) => {
        finishReject(error);
      });

      child.on('exit', (code, signal) => {
        if (waitForMatch && !settled) {
          finishReject(
            new Error(
              `Reminder CLI exited before expected output. code=${code ?? 'null'} signal=${signal ?? 'null'} stdout=${stdout.trim()} stderr=${stderr.trim()}`,
            ),
          );
          return;
        }

        if (settled) {
          return;
        }

        if (code !== 0) {
          finishReject(
            new Error(
              `Reminder CLI failed. code=${code ?? 'null'} signal=${signal ?? 'null'} stdout=${stdout.trim()} stderr=${stderr.trim()}`,
            ),
          );
          return;
        }

        finishResolve({ child, stdout, stderr });
      });
    }),
    timeoutMs,
    `reminder command ${args[0] ?? 'unknown'}`,
  );
}

async function stopChild(child, timeoutMs) {
  if (child.exitCode !== null) {
    return;
  }

  const exited = new Promise((resolve) => {
    child.once('exit', () => resolve());
  });

  child.kill('SIGINT');
  await withTimeout(exited, timeoutMs, 'reminder run shutdown');
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.has('help')) {
    printHelp();
    return;
  }

  if (!existsSync(reminderDistPath)) {
    throw new Error(
      `Missing ${reminderDistPath}. Run "npm run build --workspace @sekerchat/reminder" first.`,
    );
  }

  const apiBaseUrl = normalizeApiBaseUrl(getFlag(flags, 'api-base-url', defaultApiBaseUrl));
  const email = getFlag(flags, 'email', defaultReminderEmail).toLowerCase();
  const deviceName = getFlag(flags, 'device-name', defaultDeviceName);
  const timeoutMs = Number(getFlag(flags, 'timeout-ms', String(defaultTimeoutMs)));

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('--timeout-ms must be a number >= 1000.');
  }

  const statePath = resolve(
    projectRoot,
    'apps/reminder/.local',
    `smoke-session-${Date.now()}.json`,
  );

  await ensureParentDirectory(statePath);

  let runProcessResult = null;

  try {
    const codeResult = await runReminderCli(
      ['request-code', '--api-base-url', apiBaseUrl, '--email', email],
      { timeoutMs },
    );
    const codePayload = extractJsonObject(codeResult.stdout);
    if (!codePayload?.code) {
      throw new Error(`Reminder request-code did not return a code. stdout=${codeResult.stdout.trim()}`);
    }

    const loginResult = await runReminderCli(
      [
        'login',
        '--api-base-url',
        apiBaseUrl,
        '--state-path',
        statePath,
        '--email',
        email,
        '--code',
        codePayload.code,
        '--device-name',
        deviceName,
      ],
      { timeoutMs },
    );

    if (!/\[REMINDER\]\s+login_success\b/.test(loginResult.stdout)) {
      throw new Error(
        `Reminder login did not emit login_success. stdout=${loginResult.stdout.trim()}`,
      );
    }

    runProcessResult = await runReminderCli(
      ['run', '--state-path', statePath],
      {
        timeoutMs,
        waitForMatch: /\[REMINDER\]\s+ws_connect\b/,
      },
    );

    const wsConnectLog = runProcessResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /\[REMINDER\]\s+ws_connect\b/.test(line));

    process.stdout.write(
      `${JSON.stringify(
        {
          pass: true,
          apiBaseUrl,
          email,
          deviceName,
          statePath,
          wsConnectLog: wsConnectLog ?? null,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (runProcessResult?.child) {
      await stopChild(runProcessResult.child, timeoutMs).catch(() => {});
    }

    await rm(statePath, { force: true }).catch(() => {});
  }
}

await main().catch((error) => {
  process.stderr.write(
    [
      `SMOKE FAILED: ${error instanceof Error ? error.message : 'Unknown error.'}`,
      'Expected prerequisites:',
      `  API reachable at ${defaultApiBaseUrl} or --api-base-url override`,
      `  the reminder email can request a code and complete login (${defaultReminderEmail} by default)`,
      '  reminder dist exists after npm run build --workspace @sekerchat/reminder',
    ].join('\n') + '\n',
  );
  process.exitCode = 1;
});
