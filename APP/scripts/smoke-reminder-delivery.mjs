#!/usr/bin/env node

import { mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reminderDistPath = resolve(projectRoot, 'apps/reminder/dist/index.js');
const defaultApiBaseUrl = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3100/api';
const defaultAliceEmail = process.env.SMOKE_ALICE_EMAIL ?? 'alice@example.com';
const defaultBobEmail = process.env.SMOKE_BOB_EMAIL ?? 'bob@example.com';
const defaultTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? '12000');

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

  const session = await postJson(
    apiBaseUrl,
    '/auth/token/verify-code',
    { email, code: codeResponse.code },
    null,
    timeoutMs,
  );

  return {
    accessToken: session.accessToken,
    user: session.user,
  };
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

  const statePath = resolve(projectRoot, 'apps/reminder/.local', `delivery-session-${Date.now()}.json`);
  const tracePath = resolve(projectRoot, 'apps/reminder/.local', `delivery-trace-${Date.now()}.jsonl`);
  await mkdir(dirname(statePath), { recursive: true });

  const reminderEnv = {
    ...process.env,
    REMINDER_TRACE_PATH: tracePath,
    REMINDER_DISABLE_SIDE_EFFECTS: '1',
    REMINDER_AUTO_OPEN_LEVEL2: '1',
    REMINDER_WEB_BASE_URL: new URL(apiBaseUrl).origin,
  };

  let reminderRun = null;

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
        'slice7-smoke',
      ],
      { env: reminderEnv, timeoutMs },
    );

    if (!/\[REMINDER\]\s+login_success\b/.test(bobLogin.stdout)) {
      throw new Error(`Reminder login did not emit login_success. stdout=${bobLogin.stdout.trim()}`);
    }

    reminderRun = await runReminderCli(
      ['run', '--state-path', statePath],
      {
        env: reminderEnv,
        timeoutMs,
        waitForMatch: /\[REMINDER\]\s+ws_connect\b/,
      },
    );

    const alice = await loginBrowserUser(apiBaseUrl, aliceEmail, timeoutMs);
    const bob = await loginBrowserUser(apiBaseUrl, bobEmail, timeoutMs);

    const group = await postJson(
      apiBaseUrl,
      '/groups',
      { name: `slice7-smoke-${Date.now()}` },
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

    await postJson(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      { type: 'text', text: `normal-${Date.now()}` },
      alice.accessToken,
      timeoutMs,
    );

    const bobMessage = await postJson(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      { type: 'text', text: `bob-root-${Date.now()}` },
      bob.accessToken,
      timeoutMs,
    );

    await postJson(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      { type: 'text', text: `mention-${Date.now()} @${bobEmail}` },
      alice.accessToken,
      timeoutMs,
    );

    await postJson(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      {
        type: 'text',
        text: `reply-${Date.now()}`,
        replyToMessageId: bobMessage.id,
      },
      alice.accessToken,
      timeoutMs,
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const traceRaw = await readFile(tracePath, 'utf8');
    const entries = traceRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    const soundEntries = entries.filter((entry) => entry.action === 'sound');
    const notificationEntries = entries.filter((entry) => entry.action === 'notification');
    const openEntries = entries.filter((entry) => entry.action === 'open');

    if (soundEntries.filter((entry) => entry.level === 1).length < 1) {
      throw new Error('Expected at least one level-1 sound trace.');
    }

    if (soundEntries.filter((entry) => entry.level === 2).length < 2) {
      throw new Error('Expected at least two level-2 sound traces.');
    }

    if (notificationEntries.length < 2) {
      throw new Error('Expected at least two notification traces for mention + reply.');
    }

    if (openEntries.length < 2) {
      throw new Error('Expected at least two open traces for level-2 delivery.');
    }

    const expectedUrl = `${new URL(apiBaseUrl).origin}/groups/${group.id}`;
    if (!openEntries.every((entry) => entry.conversationUrl === expectedUrl)) {
      throw new Error(`Expected all open traces to target ${expectedUrl}.`);
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          pass: true,
          apiBaseUrl,
          groupId: group.id,
          expectedUrl,
          counts: {
            soundsLevel1: soundEntries.filter((entry) => entry.level === 1).length,
            soundsLevel2: soundEntries.filter((entry) => entry.level === 2).length,
            notifications: notificationEntries.length,
            opens: openEntries.length,
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await Promise.allSettled([
      reminderRun?.child ? stopChild(reminderRun.child, timeoutMs) : Promise.resolve(),
      existsSync(statePath) ? rm(statePath, { force: true }) : Promise.resolve(),
      existsSync(tracePath) ? rm(tracePath, { force: true }) : Promise.resolve(),
    ]);
  }
}

await main().catch((error) => {
  process.stderr.write(`SMOKE FAILED: ${error instanceof Error ? error.message : 'Unknown error.'}\n`);
  process.exitCode = 1;
});
