import { spawn } from 'node:child_process';
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  parseRealtimeEvent,
  type RealtimeEvent,
  type RealtimePullResponse,
} from '@sekerchat/contracts';
import {
  createRealtimeUrl,
  RealtimeTicketRequestError,
  requestRealtimeTicket,
} from './reminder-realtime-ticket';

interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

interface RequestCodeResponse {
  deliveryHint: string;
  code: string;
}

interface ReminderLoginResponse {
  deviceToken: string;
  deviceTokenId: string;
  deviceName: string;
  user: SessionUser;
}

interface ReminderMessagePayload {
  id: string;
  groupId: string;
  senderId: string;
  type: 'text' | 'image' | 'file';
  text: string | null;
  mentionedUserIds: string[];
  replyTo: {
    id: string;
    senderId: string;
    type: 'text' | 'image' | 'file';
    textPreview: string | null;
    sender: SessionUser;
  } | null;
  sender: SessionUser;
}

interface ReminderSessionState {
  apiBaseUrl: string;
  deviceName: string;
  deviceToken: string;
  deviceTokenId: string;
  user: SessionUser;
  savedAt: string;
  lastEventId?: string;
  cursorUpdatedAt?: string;
}

interface ReminderDeliveryAction {
  messageId: string;
  groupId: string;
  level: 1 | 2;
  conversationUrl: string;
  action: 'sound' | 'notification' | 'open';
  detail: Record<string, unknown>;
}

interface NotificationResult {
  shown: boolean;
  transport: string;
  openActionSupported: boolean;
  autoDismiss: 'supported' | 'system-controlled' | 'unsupported';
}

const defaultApiBaseUrl = process.env.REMINDER_API_BASE_URL ?? 'http://localhost:3100/api';
const defaultStatePath =
  process.env.REMINDER_STATE_PATH ?? resolve(__dirname, '..', '.local', 'session.json');
const tracePath = process.env.REMINDER_TRACE_PATH?.trim() || '';
const disableSideEffects = process.env.REMINDER_DISABLE_SIDE_EFFECTS === '1';
const overrideWebBaseUrl = process.env.REMINDER_WEB_BASE_URL?.trim() || '';
const autoOpenLevel2 = process.env.REMINDER_AUTO_OPEN_LEVEL2 === '1';
const fallbackIntervalMs = Math.max(
  1_000,
  Number.parseInt(process.env.REMINDER_FALLBACK_INTERVAL_MS ?? '5000', 10) || 5_000,
);
const recentMessageCapacity = Math.max(
  100,
  Number.parseInt(process.env.REMINDER_RECENT_MESSAGE_CAPACITY ?? '1000', 10) || 1_000,
);

function log(event: string, payload: Record<string, unknown>): void {
  process.stdout.write(`[REMINDER] ${event} ${JSON.stringify(payload)}\n`);
}

async function trace(action: ReminderDeliveryAction): Promise<void> {
  if (!tracePath) {
    return;
  }

  await ensureParentDirectory(tracePath);
  await appendFile(
    tracePath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), ...action })}\n`,
    'utf8',
  );
}

function parseArgs(argv: string[]): { command: string; flags: Map<string, string> } {
  const [command = 'help', ...rest] = argv;
  const flags = new Map<string, string>();

  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index];
    if (!entry.startsWith('--')) {
      continue;
    }

    const key = entry.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      flags.set(key, 'true');
      continue;
    }

    flags.set(key, value);
    index += 1;
  }

  return { command, flags };
}

function requireFlag(flags: Map<string, string>, key: string): string {
  const value = flags.get(key)?.trim();
  if (!value) {
    throw new Error(`Missing required flag --${key}`);
  }
  return value;
}

function normalizeApiBaseUrl(input: string): string {
  const url = new URL(input);
  return url.toString().replace(/\/$/, '');
}

function normalizeWebBaseUrl(apiBaseUrl: string): string {
  if (overrideWebBaseUrl) {
    return new URL(overrideWebBaseUrl).toString().replace(/\/$/, '');
  }

  const url = new URL(apiBaseUrl);
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function createFallbackPullUrl(apiBaseUrl: string, cursor: bigint): string {
  const pullUrl = new URL(apiBaseUrl);
  pullUrl.pathname = '/api/realtime/events';
  pullUrl.search = '';
  pullUrl.hash = '';
  pullUrl.searchParams.set('cursor', cursor.toString());
  pullUrl.searchParams.set('limit', '100');
  return pullUrl.toString();
}

function createConversationUrl(webBaseUrl: string, groupId: string): string {
  return `${webBaseUrl}/groups/${groupId}`;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with status ${response.status}`);
  }

  return payload as T;
}

async function ensureParentDirectory(pathname: string): Promise<void> {
  await mkdir(dirname(pathname), { recursive: true });
}

async function saveSession(statePath: string, session: ReminderSessionState): Promise<void> {
  await ensureParentDirectory(statePath);
  await writeFile(statePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

async function loadSession(statePath: string): Promise<ReminderSessionState> {
  const raw = await readFile(statePath, 'utf8');
  return JSON.parse(raw) as ReminderSessionState;
}

function parseEventId(value: string): bigint {
  try {
    const parsed = BigInt(value.trim());
    if (parsed < 0n) {
      throw new Error('eventId must be non-negative');
    }

    return parsed;
  } catch {
    throw new Error(`Invalid eventId "${value}".`);
  }
}

function readPersistedCursor(session: ReminderSessionState): bigint {
  const cursor = session.lastEventId?.trim();
  return cursor ? parseEventId(cursor) : 0n;
}

async function persistCursor(
  statePath: string,
  session: ReminderSessionState,
  eventId: bigint,
): Promise<void> {
  const nextCursor = eventId.toString();
  if (session.lastEventId === nextCursor) {
    return;
  }

  session.lastEventId = nextCursor;
  session.cursorUpdatedAt = new Date().toISOString();
  await saveSession(statePath, session);
}

async function requestCode(apiBaseUrl: string, email: string): Promise<void> {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const payload = await parseJsonResponse<RequestCodeResponse>(response);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    log('request_code_failed', {
      email,
      error: error instanceof Error ? error.message : 'Unknown request-code error',
    });
    throw error;
  }
}

async function loginReminderDevice(
  apiBaseUrl: string,
  statePath: string,
  email: string,
  code: string,
  deviceName: string,
): Promise<void> {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/reminder/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, deviceName }),
    });

    const payload = await parseJsonResponse<ReminderLoginResponse>(response);
    await saveSession(statePath, {
      apiBaseUrl,
      deviceName: payload.deviceName,
      deviceToken: payload.deviceToken,
      deviceTokenId: payload.deviceTokenId,
      user: payload.user,
      savedAt: new Date().toISOString(),
    });

    log('login_success', {
      userId: payload.user.id,
      deviceTokenId: payload.deviceTokenId,
      deviceName: payload.deviceName,
      statePath,
    });
  } catch (error) {
    log('login_failed', {
      email,
      deviceName,
      error: error instanceof Error ? error.message : 'Unknown login error',
    });
    throw error;
  }
}

function detectReminderLevel(message: ReminderMessagePayload, currentUserId: string): 1 | 2 {
  const isMention = message.mentionedUserIds.includes(currentUserId);
  const isReply = message.replyTo?.senderId === currentUserId;

  return isMention || isReply ? 2 : 1;
}

function summarizeMessage(message: ReminderMessagePayload): string {
  if (message.type === 'text') {
    const text = message.text?.trim() || 'New message';
    return text.length > 140 ? `${text.slice(0, 140)}...` : text;
  }

  return message.type === 'image' ? 'Sent an image' : 'Sent a file';
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function commandExists(commandPath: string): Promise<boolean> {
  try {
    await access(commandPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findFirstAvailable(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await commandExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

async function playSound(
  level: 1 | 2,
  message: ReminderMessagePayload,
  conversationUrl: string,
): Promise<void> {
  const transport = process.platform;
  const detail: Record<string, unknown> = { transport, level };

  await trace({
    action: 'sound',
    messageId: message.id,
    groupId: message.groupId,
    level,
    conversationUrl,
    detail,
  });

  if (disableSideEffects) {
    log('delivery_path', {
      messageId: message.id,
      groupId: message.groupId,
      action: 'sound',
      level,
      transport: 'disabled',
    });
    return;
  }

  if (process.platform !== 'darwin') {
    log('sound_skipped', {
      messageId: message.id,
      level,
      reason: 'Unsupported platform transport.',
      transport,
    });
    return;
  }

  const candidates =
    level === 2
      ? ['/System/Library/Sounds/Funk.aiff', '/System/Library/Sounds/Submarine.aiff']
      : ['/System/Library/Sounds/Glass.aiff', '/System/Library/Sounds/Pop.aiff'];

  for (const soundPath of candidates) {
    if (await fileExists(soundPath)) {
      spawnDetached('/usr/bin/afplay', [soundPath]);
      log('sound_played', {
        messageId: message.id,
        level,
        transport: 'afplay',
        soundPath,
      });
      log('delivery_path', {
        messageId: message.id,
        groupId: message.groupId,
        action: 'sound',
        level,
        transport: 'afplay',
      });
      return;
    }
  }

  log('sound_skipped', {
    messageId: message.id,
    level,
    reason: 'No bundled macOS sound file found.',
    transport,
  });
}

async function showNotification(
  message: ReminderMessagePayload,
  conversationUrl: string,
): Promise<NotificationResult> {
  const title = message.replyTo
    ? `${message.sender.displayName || message.sender.email} replied to you`
    : `${message.sender.displayName || message.sender.email} mentioned you`;
  const body = summarizeMessage(message);

  if (disableSideEffects) {
    await trace({
      action: 'notification',
      messageId: message.id,
      groupId: message.groupId,
      level: 2,
      conversationUrl,
      detail: {
        transport: 'disabled',
        title,
        body,
        openActionSupported: false,
        autoDismiss: 'unsupported',
      },
    });

    return {
      shown: true,
      transport: 'disabled',
      openActionSupported: false,
      autoDismiss: 'unsupported',
    };
  }

  if (process.platform === 'darwin') {
    const terminalNotifierPath = await findFirstAvailable([
      '/opt/homebrew/bin/terminal-notifier',
      '/usr/local/bin/terminal-notifier',
      '/usr/bin/terminal-notifier',
    ]);

    if (terminalNotifierPath) {
      const child = spawn(
        terminalNotifierPath,
        ['-title', title, '-message', body, '-open', conversationUrl, '-timeout', '3'],
        { stdio: 'ignore' },
      );

      await new Promise<void>((resolvePromise, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => {
          if (code && code !== 0) {
            reject(new Error(`terminal-notifier exited with code ${code}`));
            return;
          }
          resolvePromise();
        });
      });

      await trace({
        action: 'notification',
        messageId: message.id,
        groupId: message.groupId,
        level: 2,
        conversationUrl,
        detail: {
          transport: 'terminal-notifier',
          title,
          body,
          openActionSupported: true,
          autoDismiss: 'supported',
        },
      });

      return {
        shown: true,
        transport: 'terminal-notifier',
        openActionSupported: true,
        autoDismiss: 'supported',
      };
    }

    const script = `display notification "${escapeAppleScriptString(body)}" with title "${escapeAppleScriptString(
      title,
    )}" subtitle "${escapeAppleScriptString('Open the browser and go to the conversation')}"`;

    const child = spawn('/usr/bin/osascript', ['-e', script], {
      stdio: 'ignore',
    });

    await new Promise<void>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code && code !== 0) {
          reject(new Error(`osascript exited with code ${code}`));
          return;
        }
        resolvePromise();
      });
    });

    await trace({
      action: 'notification',
      messageId: message.id,
      groupId: message.groupId,
      level: 2,
      conversationUrl,
      detail: {
        transport: 'macos-osascript',
        title,
        body,
        openActionSupported: false,
        autoDismiss: 'system-controlled',
      },
    });

    return {
      shown: true,
      transport: 'macos-osascript',
      openActionSupported: false,
      autoDismiss: 'system-controlled',
    };
  }

  log('notify_skipped', {
    userId: message.senderId,
    messageId: message.id,
    reason: 'Unsupported platform transport.',
  });

  return {
    shown: false,
    transport: process.platform,
    openActionSupported: false,
    autoDismiss: 'unsupported',
  };
}

async function openConversation(
  currentUserId: string,
  message: ReminderMessagePayload,
  conversationUrl: string,
): Promise<void> {
  await trace({
    action: 'open',
    messageId: message.id,
    groupId: message.groupId,
    level: 2,
    conversationUrl,
    detail: {
      transport: process.platform,
    },
  });

  if (disableSideEffects) {
    log('browser_open', {
      userId: currentUserId,
      url: conversationUrl,
      success: true,
      transport: 'disabled',
    });
    return;
  }

  if (process.platform === 'darwin') {
    spawnDetached('/usr/bin/open', [conversationUrl]);
    log('browser_open', {
      userId: currentUserId,
      url: conversationUrl,
      success: true,
      transport: 'open',
    });
    return;
  }

  log('browser_open', {
    userId: currentUserId,
    url: conversationUrl,
    success: false,
    transport: process.platform,
  });
}

async function deliverReminder(
  session: ReminderSessionState,
  event: RealtimeEvent<ReminderMessagePayload>,
): Promise<void> {
  const message = event.payload;
  const conversationUrl = createConversationUrl(
    normalizeWebBaseUrl(session.apiBaseUrl),
    event.groupId,
  );

  if (message.senderId === session.user.id) {
    log('notify_skipped', {
      userId: session.user.id,
      messageId: message.id,
      reason: 'own_message',
    });
    return;
  }

  const level = detectReminderLevel(message, session.user.id);
  try {
    await playSound(level, message, conversationUrl);
  } catch (error) {
    log('delivery_failed', {
      userId: session.user.id,
      messageId: message.id,
      groupId: message.groupId,
      stage: 'sound',
      error: error instanceof Error ? error.message : 'Unknown sound delivery error',
    });
    throw error;
  }

  if (level === 1) {
    log('notify_shown', {
      userId: session.user.id,
      messageId: message.id,
      level,
      notification: false,
      url: conversationUrl,
    });
    return;
  }

  let notification: NotificationResult;
  try {
    notification = await showNotification(message, conversationUrl);
  } catch (error) {
    log('delivery_failed', {
      userId: session.user.id,
      messageId: message.id,
      groupId: message.groupId,
      stage: 'notification',
      error: error instanceof Error ? error.message : 'Unknown notification error',
    });
    throw error;
  }

  log('delivery_path', {
    messageId: message.id,
    groupId: message.groupId,
    action: 'notification',
    level,
    transport: notification.transport,
    shown: notification.shown,
  });

  log('notify_shown', {
    userId: session.user.id,
    messageId: message.id,
    level,
    notification: notification.shown,
    url: conversationUrl,
    transport: notification.transport,
    openActionSupported: notification.openActionSupported,
    autoDismiss: notification.autoDismiss,
  });

  if (autoOpenLevel2) {
    try {
      await openConversation(session.user.id, message, conversationUrl);
      log('delivery_path', {
        messageId: message.id,
        groupId: message.groupId,
        action: 'open',
        level,
        transport: process.platform,
      });
    } catch (error) {
      log('delivery_failed', {
        userId: session.user.id,
        messageId: message.id,
        groupId: message.groupId,
        stage: 'open',
        error: error instanceof Error ? error.message : 'Unknown browser-open error',
      });
      throw error;
    }
  }
}

async function pullFallbackEvents(
  session: ReminderSessionState,
  cursor: bigint,
): Promise<RealtimePullResponse<ReminderMessagePayload, 'message.created.v1'>> {
  try {
    const response = await fetch(createFallbackPullUrl(session.apiBaseUrl, cursor), {
      headers: {
        'x-reminder-device-token': session.deviceToken,
      },
    });

    const payload = await parseJsonResponse<{ events?: unknown; nextCursor?: unknown }>(response);
    if (!Array.isArray(payload.events) || typeof payload.nextCursor !== 'string') {
      throw new Error('Realtime pull response has an invalid shape.');
    }
    return {
      events: payload.events.map(parseReminderRealtimeEvent),
      nextCursor: payload.nextCursor,
    };
  } catch (error) {
    log('fallback_pull_failed', {
      userId: session.user.id,
      cursor: cursor.toString(),
      error: error instanceof Error ? error.message : 'Unknown fallback pull error',
    });
    throw error;
  }
}

function rememberMessageKey(
  recentMessageKeys: Map<string, true>,
  recentMessageOrder: string[],
  messageKey: string,
): void {
  if (recentMessageKeys.has(messageKey)) {
    recentMessageKeys.delete(messageKey);
    const index = recentMessageOrder.indexOf(messageKey);
    if (index >= 0) {
      recentMessageOrder.splice(index, 1);
    }
  }

  recentMessageKeys.set(messageKey, true);
  recentMessageOrder.push(messageKey);

  while (recentMessageOrder.length > recentMessageCapacity) {
    const oldest = recentMessageOrder.shift();
    if (oldest) {
      recentMessageKeys.delete(oldest);
    }
  }
}

async function handleIncomingEvent(
  session: ReminderSessionState,
  statePath: string,
  event: RealtimeEvent<ReminderMessagePayload, 'message.created.v1'>,
  source: 'ws' | 'pull',
  recentMessageKeys: Map<string, true>,
  recentMessageOrder: string[],
  runtimeState: {
    lastEventId: bigint;
  },
): Promise<void> {
  const eventId = parseEventId(event.eventId);
  const messageKey = `${event.groupId}:${event.payload?.id ?? 'unknown'}`;

  log('event_received', {
    source,
    eventId: event.eventId,
    type: event.type,
    groupId: event.groupId,
    occurredAt: event.occurredAt,
    messageId: event.payload?.id,
  });

  if (eventId <= runtimeState.lastEventId || recentMessageKeys.has(messageKey)) {
    log('notify_skipped', {
      userId: session.user.id,
      messageId: event.payload.id,
      reason: 'duplicate',
      source,
      eventId: event.eventId,
    });
    if (eventId > runtimeState.lastEventId) {
      runtimeState.lastEventId = eventId;
      await persistCursor(statePath, session, eventId);
    }
    rememberMessageKey(recentMessageKeys, recentMessageOrder, messageKey);
    return;
  }

  await deliverReminder(session, event);
  rememberMessageKey(recentMessageKeys, recentMessageOrder, messageKey);
  runtimeState.lastEventId = eventId;
  await persistCursor(statePath, session, eventId);
}

function waitForSignal(): Promise<void> {
  return new Promise((resolvePromise) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      resolvePromise();
    };

    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });
}

async function runReminder(statePath: string): Promise<void> {
  const session = await loadSession(statePath);
  const runtimeState = {
    lastEventId: readPersistedCursor(session),
  };
  const recentMessageKeys = new Map<string, true>();
  const recentMessageOrder: string[] = [];

  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let fallbackTimer: NodeJS.Timeout | null = null;
  let socket: WebSocket | null = null;
  let shouldPullOnOpen = runtimeState.lastEventId > 0n;
  let processingQueue = Promise.resolve();
  let connecting = false;

  const enqueue = (task: () => Promise<void>): void => {
    processingQueue = processingQueue.then(task).catch((error: unknown) => {
      log('event_process_failed', {
        error: error instanceof Error ? error.message : 'Unknown processing error',
      });
    });
  };

  const clearFallbackTimer = (): void => {
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const runFallbackPull = async (
    trigger: 'startup_recovery' | 'post_reconnect' | 'ws_unhealthy',
  ): Promise<void> => {
    const startCursor = runtimeState.lastEventId;
    const payload = await pullFallbackEvents(session, startCursor);

    log('fallback_pull', {
      userId: session.user.id,
      trigger,
      cursor: startCursor.toString(),
      returnedCount: payload.events.length,
      nextCursor: payload.nextCursor,
    });

    for (const event of payload.events) {
      await handleIncomingEvent(
        session,
        statePath,
        event,
        'pull',
        recentMessageKeys,
        recentMessageOrder,
        runtimeState,
      );
    }

    const nextCursor = parseEventId(payload.nextCursor);
    if (nextCursor > runtimeState.lastEventId) {
      runtimeState.lastEventId = nextCursor;
      await persistCursor(statePath, session, nextCursor);
    }
  };

  const ensureFallbackTimer = (): void => {
    if (fallbackTimer || stopped) {
      return;
    }

    fallbackTimer = setInterval(() => {
      enqueue(async () => {
        await runFallbackPull('ws_unhealthy');
      });
    }, fallbackIntervalMs);
  };

  const stopSignal = waitForSignal().then(() => {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    clearFallbackTimer();
    socket?.close();
    log('runtime_stopped', {
      userId: session.user.id,
      cursor: runtimeState.lastEventId.toString(),
    });
  });

  const scheduleReconnect = (code?: number, reason?: string) => {
    if (stopped || reconnectTimer) {
      return;
    }

    shouldPullOnOpen = true;
    ensureFallbackTimer();
    reconnectAttempt += 1;
    const delayMs = Math.min(1_000 * reconnectAttempt, 5_000);
    log('ws_reconnect', {
      userId: session.user.id,
      attempt: reconnectAttempt,
      delayMs,
      code,
      reason,
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  };

  const connect = (): void => {
    if (connecting || stopped) return;
    connecting = true;
    void (async () => {
      try {
        const { ticket } = await requestRealtimeTicket(session.apiBaseUrl, session.deviceToken);
        if (stopped) return;
        const nextSocket = new WebSocket(createRealtimeUrl(session.apiBaseUrl, ticket));
        socket = nextSocket;

        nextSocket.addEventListener('open', () => {
          const pullTrigger: 'startup_recovery' | 'post_reconnect' =
            reconnectAttempt > 0 ? 'post_reconnect' : 'startup_recovery';
          reconnectAttempt = 0;
          clearFallbackTimer();
          log('ws_connect', {
            userId: session.user.id,
            deviceTokenId: session.deviceTokenId,
            cursor: runtimeState.lastEventId.toString(),
          });

          if (shouldPullOnOpen) {
            shouldPullOnOpen = false;
            enqueue(async () => {
              await runFallbackPull(pullTrigger);
            });
          }
        });

        nextSocket.addEventListener('message', (messageEvent) => {
          void (async () => {
            try {
              const event = parseReminderRealtimeEvent(JSON.parse(String(messageEvent.data)));
              enqueue(async () => {
                await handleIncomingEvent(
                  session,
                  statePath,
                  event,
                  'ws',
                  recentMessageKeys,
                  recentMessageOrder,
                  runtimeState,
                );
              });
            } catch (error) {
              log('event_parse_failed', {
                error: error instanceof Error ? error.message : 'Unknown parse error',
              });
            }
          })();
        });

        nextSocket.addEventListener('close', (closeEvent) => {
          socket = null;
          scheduleReconnect(closeEvent.code, closeEvent.reason);
        });

        nextSocket.addEventListener('error', () => {
          log('ws_error', { userId: session.user.id });
        });
      } catch (error) {
        const credentialsRejected =
          error instanceof RealtimeTicketRequestError &&
          (error.status === 401 || error.status === 403);
        log('realtime_ticket_failed', {
          userId: session.user.id,
          error: error instanceof Error ? error.message : 'Unknown ticket error',
          retry: !credentialsRejected,
        });
        if (credentialsRejected) {
          stopped = true;
          clearFallbackTimer();
        } else {
          scheduleReconnect();
        }
      } finally {
        connecting = false;
      }
    })();
  };

  log('runtime_started', {
    userId: session.user.id,
    deviceTokenId: session.deviceTokenId,
    cursor: runtimeState.lastEventId.toString(),
  });
  connect();
  await stopSignal;
  await processingQueue;

  while (!stopped) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

function parseReminderRealtimeEvent(
  input: unknown,
): RealtimeEvent<ReminderMessagePayload, 'message.created.v1'> {
  const result = parseRealtimeEvent(input);
  if (!result.success) throw new Error(result.reason);
  if (result.data.type !== 'message.created.v1') {
    throw new Error(`Unsupported reminder event type: ${result.data.type}`);
  }
  return result.data as unknown as RealtimeEvent<ReminderMessagePayload, 'message.created.v1'>;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  node dist/index.js request-code --email <email> [--api-base-url <url>]',
      '  node dist/index.js login --email <email> --code <code> --device-name <name> [--api-base-url <url>] [--state-path <path>]',
      '  node dist/index.js run [--state-path <path>]',
    ].join('\n') + '\n',
  );
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const apiBaseUrl = normalizeApiBaseUrl(flags.get('api-base-url') ?? defaultApiBaseUrl);
  const statePath = resolve(flags.get('state-path') ?? defaultStatePath);

  if (command === 'request-code') {
    await requestCode(apiBaseUrl, requireFlag(flags, 'email'));
    return;
  }

  if (command === 'login') {
    await loginReminderDevice(
      apiBaseUrl,
      statePath,
      requireFlag(flags, 'email'),
      requireFlag(flags, 'code'),
      requireFlag(flags, 'device-name'),
    );
    return;
  }

  if (command === 'run') {
    await runReminder(statePath);
    return;
  }

  printHelp();
}

void main().catch((error: unknown) => {
  log('fatal', {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  process.exitCode = 1;
});
