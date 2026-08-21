#!/usr/bin/env node

import WebSocket from 'ws';

const DEFAULT_API_BASE_URL = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3100/api';
const DEFAULT_BROWSER_ORIGIN = process.env.SMOKE_BROWSER_ORIGIN ?? 'http://127.0.0.1:5173';
const DEFAULT_ALICE_EMAIL = process.env.SMOKE_ALICE_EMAIL ?? 'alice@example.com';
const DEFAULT_BOB_EMAIL = process.env.SMOKE_BOB_EMAIL ?? 'bob@example.com';
const DEFAULT_ALICE_PASSWORD = process.env.SMOKE_ALICE_PASSWORD ?? process.env.SMOKE_PASSWORD ?? '';
const DEFAULT_BOB_PASSWORD = process.env.SMOKE_BOB_PASSWORD ?? process.env.SMOKE_PASSWORD ?? '';
const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? '8000');
const DEFAULT_REALTIME_TIMEOUT_MS = Number(process.env.SMOKE_REALTIME_TIMEOUT_MS ?? '20000');

function printHelp() {
  process.stdout.write(
    [
      'Web realtime smoke',
      '',
      'Prerequisites:',
      '  1. Backend is already running and reachable at the API base URL.',
      '  2. Both smoke users exist and have password login enabled.',
      '  3. Node runtime provides fetch (Node 22+ expected here).',
      '',
      'Usage:',
      '  SMOKE_PASSWORD=<password> npm run smoke:web-realtime -- --alice-email <email> --bob-email <email>',
      '',
      'Defaults:',
      `  --api-base-url ${DEFAULT_API_BASE_URL}`,
      `  --browser-origin ${DEFAULT_BROWSER_ORIGIN}`,
      `  --alice-email ${DEFAULT_ALICE_EMAIL}`,
      `  --bob-email ${DEFAULT_BOB_EMAIL}`,
      `  --timeout-ms ${DEFAULT_TIMEOUT_MS}`,
      `  --realtime-timeout-ms ${DEFAULT_REALTIME_TIMEOUT_MS}`,
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

function createRealtimeUrl(apiBaseUrl) {
  const realtimeUrl = new URL(apiBaseUrl);
  realtimeUrl.protocol = realtimeUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  realtimeUrl.pathname = '/realtime';
  realtimeUrl.search = '';
  realtimeUrl.hash = '';
  return realtimeUrl.toString();
}

function ensureRuntimeSupport() {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node 22+ in this workspace.');
  }
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

async function postJsonWithAuth(apiBaseUrl, pathname, cookie, body, timeoutMs) {
  const response = await withTimeout(
    fetch(`${apiBaseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    timeoutMs,
    `POST ${pathname}`,
  );

  return parseJsonResponse(response);
}

async function getJson(apiBaseUrl, pathname, cookie, timeoutMs) {
  const response = await withTimeout(
    fetch(`${apiBaseUrl}${pathname}`, {
      headers: { Cookie: cookie },
    }),
    timeoutMs,
    `GET ${pathname}`,
  );

  return parseJsonResponse(response);
}

async function loginBrowserUser(apiBaseUrl, browserOrigin, email, password, timeoutMs) {
  const response = await withTimeout(
    fetch(`${apiBaseUrl}/auth/browser/login`, {
      method: 'POST',
      headers: { Origin: browserOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    timeoutMs,
    `POST /auth/browser/login (${email})`,
  );
  const session = await parseJsonResponse(response);

  if (!session?.user?.id) {
    throw new Error(`Login for ${email} did not return a usable session.`);
  }
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(';', 1)[0])
    .join('; ');
  if (!cookie) throw new Error(`Login for ${email} did not set a browser session cookie.`);

  return {
    email,
    cookie,
    user: session.user,
  };
}

async function openRealtimeSocket(
  label,
  realtimeUrl,
  cookie,
  browserOrigin,
  expectedUserId,
  timeoutMs,
) {
  const socket = new WebSocket(realtimeUrl, {
    headers: { Cookie: cookie, Origin: browserOrigin },
  });
  const authenticated = waitForRealtimeEvent(
    socket,
    `${label} authentication`,
    (event) =>
      event?.type === 'presence.changed.v1' &&
      event?.payload?.userId === expectedUserId &&
      event?.payload?.online === true,
    timeoutMs,
  );

  await withTimeout(
    new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('error', handleError);
        socket.removeEventListener('close', handleClose);
      };

      const handleOpen = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error(`${label} websocket failed before open.`));
      };

      const handleClose = (event) => {
        cleanup();
        reject(
          new Error(
            `${label} websocket closed before open with code ${event.code} (${event.reason || 'no reason'}).`,
          ),
        );
      };

      socket.addEventListener('open', handleOpen);
      socket.addEventListener('error', handleError);
      socket.addEventListener('close', handleClose);
    }),
    timeoutMs,
    `${label} websocket open`,
  );
  await authenticated;

  return socket;
}

function waitForRealtimeEvent(socket, label, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const observed = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `${label} realtime event timed out after ${timeoutMs}ms; observed=${JSON.stringify(observed)}`,
        ),
      );
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('close', handleClose);
      socket.removeEventListener('error', handleError);
    };

    const handleMessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        observed.push({
          type: payload?.type ?? null,
          groupId: payload?.groupId ?? null,
          text: payload?.payload?.text ?? null,
          userId: payload?.payload?.userId ?? null,
          online: payload?.payload?.online ?? null,
        });
        if (observed.length > 5) observed.shift();
        if (predicate(payload)) {
          cleanup();
          resolve(payload);
        }
      } catch (error) {
        cleanup();
        reject(
          new Error(
            `${label} websocket emitted invalid JSON: ${
              error instanceof Error ? error.message : 'unknown parse error'
            }`,
          ),
        );
      }
    };

    const handleClose = (event) => {
      cleanup();
      reject(
        new Error(
          `${label} websocket closed while waiting for event with code ${event.code} (${event.reason || 'no reason'}).`,
        ),
      );
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`${label} websocket errored while waiting for event.`));
    };

    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', handleClose);
    socket.addEventListener('error', handleError);
  });
}

async function closeSocket(socket, timeoutMs, label) {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  const closed = new Promise((resolve) => {
    const handleClose = () => {
      socket.removeEventListener('close', handleClose);
      resolve();
    };

    socket.addEventListener('close', handleClose);
  });

  socket.close(1000, 'Smoke complete');
  await withTimeout(closed, timeoutMs, `${label} websocket close`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.has('help')) {
    printHelp();
    return;
  }

  ensureRuntimeSupport();

  const apiBaseUrl = normalizeApiBaseUrl(getFlag(flags, 'api-base-url', DEFAULT_API_BASE_URL));
  const browserOrigin = getFlag(flags, 'browser-origin', DEFAULT_BROWSER_ORIGIN);
  const aliceEmail = getFlag(flags, 'alice-email', DEFAULT_ALICE_EMAIL).toLowerCase();
  const bobEmail = getFlag(flags, 'bob-email', DEFAULT_BOB_EMAIL).toLowerCase();
  const alicePassword = getFlag(flags, 'alice-password', DEFAULT_ALICE_PASSWORD);
  const bobPassword = getFlag(flags, 'bob-password', DEFAULT_BOB_PASSWORD);
  const timeoutMs = Number(getFlag(flags, 'timeout-ms', String(DEFAULT_TIMEOUT_MS)));
  const realtimeTimeoutMs = Number(
    getFlag(flags, 'realtime-timeout-ms', String(DEFAULT_REALTIME_TIMEOUT_MS)),
  );

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('--timeout-ms must be a number >= 1000.');
  }
  if (!Number.isFinite(realtimeTimeoutMs) || realtimeTimeoutMs < 10_000) {
    throw new Error('--realtime-timeout-ms must cover the 10s outbox interval.');
  }
  if (!alicePassword || !bobPassword) {
    throw new Error('Set SMOKE_PASSWORD or both --alice-password and --bob-password.');
  }

  const alice = await loginBrowserUser(
    apiBaseUrl,
    browserOrigin,
    aliceEmail,
    alicePassword,
    timeoutMs,
  );
  const bob = await loginBrowserUser(apiBaseUrl, browserOrigin, bobEmail, bobPassword, timeoutMs);

  const aliceSocket = await openRealtimeSocket(
    'alice',
    createRealtimeUrl(apiBaseUrl),
    alice.cookie,
    browserOrigin,
    alice.user.id,
    timeoutMs,
  );

  let bobSocket = await openRealtimeSocket(
    'bob',
    createRealtimeUrl(apiBaseUrl),
    bob.cookie,
    browserOrigin,
    bob.user.id,
    timeoutMs,
  );

  try {
    const groupName = `smoke-${Date.now()}`;
    const group = await postJsonWithAuth(
      apiBaseUrl,
      '/groups',
      alice.cookie,
      { name: groupName },
      timeoutMs,
    );

    if (!group?.id) {
      throw new Error('Group creation did not return a group id.');
    }

    await postJsonWithAuth(
      apiBaseUrl,
      `/groups/${group.id}/members`,
      alice.cookie,
      { email: bob.email },
      timeoutMs,
    );

    const firstMessageText = `smoke-first-${Date.now()}`;
    const firstEventPromise = waitForRealtimeEvent(
      bobSocket,
      'bob',
      (event) =>
        event?.eventVersion === 1 &&
        event?.type === 'message.created.v1' &&
        event?.groupId === group.id &&
        event?.payload?.text === firstMessageText,
      realtimeTimeoutMs,
    );

    const firstMessage = await postJsonWithAuth(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      alice.cookie,
      { type: 'text', text: firstMessageText },
      timeoutMs,
    );

    const firstEvent = await firstEventPromise;

    await closeSocket(bobSocket, timeoutMs, 'bob');
    bobSocket = await openRealtimeSocket(
      'bob-reconnect',
      createRealtimeUrl(apiBaseUrl),
      bob.cookie,
      browserOrigin,
      bob.user.id,
      timeoutMs,
    );

    const secondMessageText = `smoke-second-${Date.now()}`;
    const secondAliceEventPromise = waitForRealtimeEvent(
      aliceSocket,
      'alice-second',
      (event) =>
        event?.type === 'message.created.v1' &&
        event?.groupId === group.id &&
        event?.payload?.text === secondMessageText,
      realtimeTimeoutMs,
    );
    const secondEventPromise = waitForRealtimeEvent(
      bobSocket,
      'bob-reconnect',
      (event) =>
        event?.eventVersion === 1 &&
        event?.type === 'message.created.v1' &&
        event?.groupId === group.id &&
        event?.payload?.text === secondMessageText,
      realtimeTimeoutMs,
    );

    const secondMessage = await postJsonWithAuth(
      apiBaseUrl,
      `/groups/${group.id}/messages`,
      alice.cookie,
      { type: 'text', text: secondMessageText },
      timeoutMs,
    );

    const [secondAliceResult, secondBobResult] = await Promise.allSettled([
      secondAliceEventPromise,
      secondEventPromise,
    ]);
    if (process.env.SMOKE_DEBUG === '1') {
      process.stderr.write(
        `second event delivery: alice=${secondAliceResult.status}, bob=${secondBobResult.status}\n`,
      );
    }
    if (secondBobResult.status === 'rejected') throw secondBobResult.reason;
    if (secondAliceResult.status === 'rejected') throw secondAliceResult.reason;
    const secondEvent = secondBobResult.value;
    const groupSnapshot = await getJson(apiBaseUrl, `/groups/${group.id}`, alice.cookie, timeoutMs);

    process.stdout.write(
      `${JSON.stringify(
        {
          pass: true,
          apiBaseUrl,
          group: {
            id: group.id,
            name: group.name,
            memberCount: Array.isArray(groupSnapshot?.members)
              ? groupSnapshot.members.length
              : null,
          },
          users: {
            alice: alice.user.email,
            bob: bob.user.email,
          },
          firstMessage: {
            id: firstMessage.id,
            text: firstMessage.text,
            deliveredType: firstEvent.type,
          },
          secondMessage: {
            id: secondMessage.id,
            text: secondMessage.text,
            deliveredType: secondEvent.type,
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await Promise.allSettled([
      closeSocket(aliceSocket, timeoutMs, 'alice'),
      closeSocket(bobSocket, timeoutMs, 'bob-final'),
    ]);
  }
}

await main().catch((error) => {
  process.stderr.write(
    [
      `SMOKE FAILED: ${error instanceof Error ? error.message : 'Unknown error.'}`,
      'Expected prerequisites:',
      `  API reachable at ${DEFAULT_API_BASE_URL} or --api-base-url override`,
      `  both smoke users can complete password login (${DEFAULT_ALICE_EMAIL}, ${DEFAULT_BOB_EMAIL} by default)`,
    ].join('\n') + '\n',
  );
  process.exitCode = 1;
});
