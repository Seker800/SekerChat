#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reminderDistPath = resolve(projectRoot, 'apps/reminder/dist/index.js');
const defaultApiBaseUrl = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3100/api';
const defaultAliceEmail = process.env.SMOKE_ALICE_EMAIL ?? 'alice@example.com';
const defaultBobEmail = process.env.SMOKE_BOB_EMAIL ?? 'bob@example.com';
const defaultTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? '15000');

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

async function parseJsonResponse(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload ? payload.message : null;
    throw new Error(message ?? `Request failed with status ${response.status}.`);
  }

  return payload;
}

async function postJson(apiBaseUrl, pathname, body, accessToken, timeoutMs) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await withTimeout(
    fetch(`${apiBaseUrl}${pathname}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    timeoutMs,
    `POST ${pathname}`,
  );

  return parseJsonResponse(response);
}

async function runReminderCli(args, options = {}) {
  const {
    cwd = projectRoot,
    env = process.env,
    timeoutMs = defaultTimeoutMs,
    waitForMatch = null,
  } = options;

  return withTimeout(
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [reminderDistPath, ...args], {
        cwd,
        env,
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

      child.on('error', finishReject);

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

async function loginBrowserUser(apiBaseUrl, email, timeoutMs) {
  const codeResponse = await postJson(apiBaseUrl, '/auth/token/request-code', { email }, null, timeoutMs);
  if (!codeResponse?.code) {
    throw new Error(`Auth code request for ${email} did not return a code.`);
  }

  return postJson(
    apiBaseUrl,
    '/auth/token/verify-code',
    { email, code: codeResponse.code },
    null,
    timeoutMs,
  );
}

async function readTraceEntries(tracePath) {
  if (!existsSync(tracePath)) {
    return [];
  }

  const raw = await readFile(tracePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function waitForTraceCount(tracePath, expectedCount, timeoutMs) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const start = Date.now();

      const poll = async () => {
        try {
          const entries = await readTraceEntries(tracePath);
          const soundEntries = entries.filter((entry) => entry.action === 'sound');
          if (soundEntries.length >= expectedCount) {
            resolve(soundEntries);
            return;
          }

          if (Date.now() - start >= timeoutMs) {
            reject(new Error(`Timed out waiting for ${expectedCount} sound trace entries.`));
            return;
          }

          setTimeout(() => {
            void poll();
          }, 150);
        } catch (error) {
          reject(error);
        }
      };

      void poll();
    }),
    timeoutMs + 1000,
    'trace polling',
  );
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (!existsSync(reminderDistPath)) {
    throw new Error(`Missing ${reminderDistPath}. Run "npm run build" first.`);
  }

  const apiBaseUrl = normalizeApiBaseUrl(getFlag(flags, 'api-base-url', defaultApiBaseUrl));
  const aliceEmail = getFlag(flags, 'alice-email', defaultAliceEmail).toLowerCase();
  const bobEmail = getFlag(flags, 'bob-email', defaultBobEmail).toLowerCase();
  const timeoutMs = Number(getFlag(flags, 'timeout-ms', String(defaultTimeoutMs)));

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('--timeout-ms must be a number >= 1000.');
  }

  const statePath = resolve(projectRoot, 'apps/reminder/.local', `fallback-session-${Date.now()}.json`);
  const tracePath = resolve(projectRoot, 'apps/reminder/.local', `fallback-trace-${Date.now()}.jsonl`);
  await mkdir(dirname(statePath), { recursive: true });

  const reminderEnv = {
    ...process.env,
    REMINDER_TRACE_PATH: tracePath,
    REMINDER_DISABLE_SIDE_EFFECTS: '1',
    REMINDER_WEB_BASE_URL: new URL(apiBaseUrl).origin,
    REMINDER_FALLBACK_INTERVAL_MS: '1000',
  };

  let firstRun = null;
  let secondRun = null;

  try {
    const bobCode = await postJson(apiBaseUrl, '/auth/request-code', { email: bobEmail }, null, timeoutMs);
    const bobLogin = await runReminderCli(
      [
        'login',
        '--api-base-url',
        apiBaseUrl,
        '--state-path',
        statePath,
        '--email',
        bobEmail,
        '--code',
        bobCode.code,
        '--device-name',
        'slice8-smoke',
      ],
      { env: reminderEnv, timeoutMs },
    );

    if (!/\[REMINDER\]\s+login_success\b/.test(bobLogin.stdout)) {
      throw new Error(`Reminder login did not emit login_success. stdout=${bobLogin.stdout.trim()}`);
    }

    firstRun = await runReminderCli(
      ['run', '--state-path', statePath],
      {
        env: reminderEnv,
        timeoutMs,
        waitForMatch: /\[REMINDER\]\s+ws_connect\b/,
      },
    );

    const alice = await loginBrowserUser(apiBaseUrl, aliceEmail, timeoutMs);
    const group = await postJson(
      apiBaseUrl,
      '/groups',
      { name: `slice8-smoke-${Date.now()}` },
      alice.accessToken,
      timeoutMs,
    );
    await postJson(
      apiBaseUrl,
      `/groups/${group.id}/members`,
      { email: bobEmail },
      alice.accessToken,
      timeoutMs,
    );

    const onlineMessage = await postJson(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      { type: 'text', text: `slice8-online-${Date.now()}` },
      alice.accessToken,
      timeoutMs,
    );

    await waitForTraceCount(tracePath, 1, timeoutMs);
    const firstState = JSON.parse(await readFile(statePath, 'utf8'));
    const firstCursor = BigInt(firstState.lastEventId ?? '0');
    if (firstCursor <= 0n) {
      throw new Error('Expected reminder state file to persist a cursor after the first websocket delivery.');
    }

    await stopChild(firstRun.child, timeoutMs);
    firstRun = null;

    const offlineMessage = await postJson(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      { type: 'text', text: `slice8-offline-${Date.now()}` },
      alice.accessToken,
      timeoutMs,
    );

    secondRun = await runReminderCli(
      ['run', '--state-path', statePath],
      {
        env: reminderEnv,
        timeoutMs,
        waitForMatch: /\[REMINDER\]\s+fallback_pull\b/,
      },
    );

    const soundEntries = await waitForTraceCount(tracePath, 2, timeoutMs);
    const secondState = JSON.parse(await readFile(statePath, 'utf8'));
    const secondCursor = BigInt(secondState.lastEventId ?? '0');

    if (secondCursor <= firstCursor) {
      throw new Error('Expected reminder state file cursor to advance after fallback recovery.');
    }

    const deliveredMessageIds = soundEntries.map((entry) => entry.messageId);
    const offlineMatches = deliveredMessageIds.filter((messageId) => messageId === offlineMessage.id);
    if (offlineMatches.length !== 1) {
      throw new Error(
        `Expected offline message ${offlineMessage.id} to be delivered exactly once after restart, got ${offlineMatches.length}.`,
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          pass: true,
          apiBaseUrl,
          groupId: group.id,
          onlineMessageId: onlineMessage.id,
          offlineMessageId: offlineMessage.id,
          firstCursor: firstCursor.toString(),
          secondCursor: secondCursor.toString(),
          secondRunLogIncludesFallbackPull: /\[REMINDER\]\s+fallback_pull\b/.test(secondRun.stdout),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await Promise.allSettled([
      firstRun?.child ? stopChild(firstRun.child, timeoutMs) : Promise.resolve(),
      secondRun?.child ? stopChild(secondRun.child, timeoutMs) : Promise.resolve(),
      existsSync(statePath) ? rm(statePath, { force: true }) : Promise.resolve(),
      existsSync(tracePath) ? rm(tracePath, { force: true }) : Promise.resolve(),
    ]);
  }
}

await main().catch((error) => {
  process.stderr.write(`SMOKE FAILED: ${error instanceof Error ? error.message : 'Unknown error.'}\n`);
  process.exitCode = 1;
});
