#!/usr/bin/env node

const DEFAULT_API_BASE_URL = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3100/api';
const DEFAULT_EMAIL = process.env.SMOKE_GROUPS_EMAIL ?? 'alice@example.com';
const DEFAULT_EMAIL_CODE = process.env.SMOKE_EMAIL_CODE ?? '';
const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? '8000');

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

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
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

async function postJson(apiBaseUrl, pathname, body, timeoutMs) {
  const response = await withTimeout(
    fetch(`${apiBaseUrl}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    timeoutMs,
    `POST ${pathname}`,
  );

  return parseJsonResponse(response);
}

async function getJson(apiBaseUrl, pathname, accessToken, timeoutMs) {
  const response = await withTimeout(
    fetch(`${apiBaseUrl}${pathname}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
    timeoutMs,
    `GET ${pathname}`,
  );

  return parseJsonResponse(response);
}

async function login(apiBaseUrl, email, emailCode, timeoutMs) {
  const codeResponse = await postJson(apiBaseUrl, '/auth/token/request-code', { email }, timeoutMs);
  const code = codeResponse?.code ?? emailCode;
  if (!code) {
    throw new Error(`Auth code request for ${email} did not return a code. Set SMOKE_EMAIL_CODE to a real verification code.`);
  }

  const session = await postJson(
    apiBaseUrl,
    '/auth/token/verify-code',
    { email, code },
    timeoutMs,
  );

  if (!session?.accessToken || !session?.user?.id) {
    throw new Error(`Login for ${email} did not return a usable session.`);
  }

  return session;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const apiBaseUrl = getFlag(flags, 'api-base-url', DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const email = getFlag(flags, 'email', DEFAULT_EMAIL);
  const emailCode = getFlag(flags, 'email-code', DEFAULT_EMAIL_CODE);
  const timeoutMs = Number(getFlag(flags, 'timeout-ms', String(DEFAULT_TIMEOUT_MS)));

  const session = await login(apiBaseUrl, email, emailCode, timeoutMs);
  const groups = await getJson(apiBaseUrl, '/groups', session.accessToken, timeoutMs);

  if (!Array.isArray(groups)) {
    throw new Error('Groups response was not an array.');
  }

  const firstAccessibleGroup = groups.find((group) => !group.archivedAt) ?? groups[0] ?? null;

  if (firstAccessibleGroup) {
    await getJson(apiBaseUrl, `/groups/${firstAccessibleGroup.id}`, session.accessToken, timeoutMs);
  }

  process.stdout.write(
    JSON.stringify(
      {
        status: 'ok',
        email: session.user.email,
        groupCount: groups.length,
        firstGroupId: firstAccessibleGroup?.id ?? null,
        firstGroupName: firstAccessibleGroup?.name ?? null,
      },
      null,
      2,
    ) + '\n',
  );
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
