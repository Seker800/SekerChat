import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join, resolve } from 'node:path';

interface DesktopConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  email: string;
  deviceName: string;
  openAtLogin: boolean;
  autoStartOnLaunch: boolean;
  updatedAt: string | null;
}

interface RuntimeState {
  running: boolean;
  pid: number | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastError: string | null;
  startedAt: string | null;
}

interface BootstrapState {
  config: DesktopConfig;
  runtime: RuntimeState;
  statePath: string;
  sessionExists: boolean;
  platform: NodeJS.Platform;
  logs: string[];
}

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

const defaultConfig: DesktopConfig = {
  apiBaseUrl: 'http://localhost:3100/api',
  webBaseUrl: 'http://localhost:5173',
  email: '',
  deviceName: 'mac-reminder',
  openAtLogin: false,
  autoStartOnLaunch: true,
  updatedAt: null,
};

const maxLogLines = 200;
let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let reminderProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
let reminderStdoutBuffer = '';
let reminderStderrBuffer = '';
const recentLogs: string[] = [];
const runtimeState: RuntimeState = {
  running: false,
  pid: null,
  lastExitCode: null,
  lastExitSignal: null,
  lastError: null,
  startedAt: null,
};

function getPaths() {
  const userDataDir = app.getPath('userData');
  return {
    userDataDir,
    configPath: join(userDataDir, 'desktop-config.json'),
    statePath: join(userDataDir, 'reminder-session.json'),
  };
}

function getCliEntryPath(): string {
  return app.isPackaged ? join(app.getAppPath(), 'dist', 'index.js') : join(__dirname, 'index.js');
}

function getDesktopHtmlPath(): string {
  return resolve(__dirname, 'desktop', 'index.html');
}

function getCliSpawnConfig(extraEnv: NodeJS.ProcessEnv = {}): {
  command: string;
  env: NodeJS.ProcessEnv;
} {
  if (app.isPackaged) {
    return {
      command: process.execPath,
      env: {
        ...process.env,
        ...extraEnv,
        ELECTRON_RUN_AS_NODE: '1',
      },
    };
  }

  return {
    command: process.env.CLI_NODE_PATH?.trim() || 'node',
    env: {
      ...process.env,
      ...extraEnv,
    },
  };
}

function broadcastRuntimeEvent(payload: Record<string, unknown>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:runtime-event', payload);
  }
}

function appendLog(line: string): void {
  const normalized = line.trim();
  if (!normalized) {
    return;
  }

  recentLogs.push(normalized);
  if (recentLogs.length > maxLogLines) {
    recentLogs.splice(0, recentLogs.length - maxLogLines);
  }

  broadcastRuntimeEvent({
    type: 'log',
    line: normalized,
  });
}

function consumeBufferedLines(
  existingBuffer: string,
  chunk: string,
  consumer: (line: string) => void,
): string {
  const combined = `${existingBuffer}${chunk}`;
  const lines = combined.split(/\r?\n/);
  const trailing = lines.pop() ?? '';

  for (const line of lines) {
    consumer(line);
  }

  return trailing;
}

async function ensureUserDataDir(): Promise<void> {
  await mkdir(getPaths().userDataDir, { recursive: true });
}

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadConfig(): Promise<DesktopConfig> {
  const { configPath } = getPaths();
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DesktopConfig>;
    return {
      ...defaultConfig,
      ...parsed,
    };
  } catch {
    return { ...defaultConfig };
  }
}

async function saveConfig(input: Partial<DesktopConfig>): Promise<DesktopConfig> {
  await ensureUserDataDir();
  const nextConfig: DesktopConfig = {
    ...(await loadConfig()),
    ...input,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(getPaths().configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  return nextConfig;
}

async function saveReminderSession(statePath: string, session: ReminderSessionState): Promise<void> {
  await ensureUserDataDir();
  await writeFile(statePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

function extractJsonObject(text: string): unknown {
  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  try {
    return JSON.parse(text.slice(startIndex, endIndex + 1));
  } catch {
    return null;
  }
}

function requireNonEmptyDesktopField(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with status ${response.status}`);
  }

  return payload as T;
}

async function postJson<T>(
  apiBaseUrl: string,
  pathname: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return parseJsonResponse<T>(response);
}

async function getBootstrapState(): Promise<BootstrapState> {
  const { statePath } = getPaths();
  return {
    config: await loadConfig(),
    runtime: { ...runtimeState },
    statePath,
    sessionExists: await fileExists(statePath),
    platform: process.platform,
    logs: [...recentLogs],
  };
}

function updateTrayMenu(): void {
  if (!tray) {
    return;
  }

  const items: MenuItemConstructorOptions[] = [
    {
      label: 'Open Reminder',
      click: () => {
        showWindow();
      },
    },
    runtimeState.running
      ? {
          label: 'Stop Reminder',
          click: () => {
            void stopReminderProcess();
          },
        }
      : {
          label: 'Start Reminder',
          click: () => {
            void startReminderProcess();
          },
        },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(
    runtimeState.running ? 'Minimal IM Reminder (running)' : 'Minimal IM Reminder (stopped)',
  );
}

function createTrayIcon(): Tray {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <path fill="black" d="M11 3a5 5 0 0 0-5 5v3.4l-1.6 2.9a1 1 0 0 0 .9 1.5h11.4a1 1 0 0 0 .9-1.5L16 11.4V8a5 5 0 0 0-5-5Zm0 16a2.4 2.4 0 0 0 2.3-1.7H8.7A2.4 2.4 0 0 0 11 19Z"/>
    </svg>`,
  );
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=UTF-8,${svg}`);
  icon.setTemplateImage(true);
  return new Tray(icon);
}

function showWindow(): void {
  if (!mainWindow) {
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 460,
    height: 760,
    resizable: false,
    show: false,
    title: 'Minimal IM Reminder',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void window.loadFile(getDesktopHtmlPath());

  window.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    window.hide();
  });

  return window;
}

async function stopReminderProcess(): Promise<void> {
  const activeProcess = reminderProcess;
  if (!activeProcess) {
    runtimeState.running = false;
    runtimeState.pid = null;
    updateTrayMenu();
    broadcastRuntimeEvent({
      type: 'runtime-state',
      runtime: { ...runtimeState },
    });
    return;
  }

  reminderProcess = null;
  await new Promise<void>((resolvePromise) => {
    activeProcess.once('exit', () => {
      resolvePromise();
    });
    activeProcess.kill('SIGTERM');
  });
}

async function startReminderProcess(): Promise<void> {
  if (reminderProcess) {
    return;
  }

  const { statePath } = getPaths();
  if (!(await fileExists(statePath))) {
    throw new Error('No reminder session found. Please log in first.');
  }

  const spawnConfig = getCliSpawnConfig({
    REMINDER_WEB_BASE_URL: (await loadConfig()).webBaseUrl,
  });
  const child = spawn(spawnConfig.command, [getCliEntryPath(), 'run', '--state-path', statePath], {
    env: spawnConfig.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  reminderProcess = child;
  runtimeState.running = true;
  runtimeState.pid = child.pid ?? null;
  runtimeState.lastError = null;
  runtimeState.lastExitCode = null;
  runtimeState.lastExitSignal = null;
  runtimeState.startedAt = new Date().toISOString();
  appendLog(`[DESKTOP] runtime_started pid=${runtimeState.pid ?? 'unknown'}`);
  updateTrayMenu();
  broadcastRuntimeEvent({
    type: 'runtime-state',
    runtime: { ...runtimeState },
  });

  child.stdout.on('data', (chunk) => {
    reminderStdoutBuffer = consumeBufferedLines(reminderStdoutBuffer, String(chunk), appendLog);
  });

  child.stderr.on('data', (chunk) => {
    reminderStderrBuffer = consumeBufferedLines(reminderStderrBuffer, String(chunk), (line) => {
      appendLog(`[REMINDER-ERR] ${line}`);
    });
  });

  child.once('error', (error) => {
    runtimeState.lastError = error.message;
    appendLog(`[DESKTOP] runtime_error ${error.message}`);
  });

  child.once('exit', (code, signal) => {
    if (reminderStdoutBuffer.trim()) {
      appendLog(reminderStdoutBuffer);
      reminderStdoutBuffer = '';
    }
    if (reminderStderrBuffer.trim()) {
      appendLog(`[REMINDER-ERR] ${reminderStderrBuffer}`);
      reminderStderrBuffer = '';
    }

    reminderProcess = null;
    runtimeState.running = false;
    runtimeState.pid = null;
    runtimeState.lastExitCode = code;
    runtimeState.lastExitSignal = signal;
    appendLog(
      `[DESKTOP] runtime_stopped code=${code ?? 'null'} signal=${signal ?? 'null'}`,
    );
    updateTrayMenu();
    broadcastRuntimeEvent({
      type: 'runtime-state',
      runtime: { ...runtimeState },
    });
  });
}

function configureOpenAtLogin(enabled: boolean): void {
  if (process.platform !== 'darwin') {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('desktop:bootstrap', async () => getBootstrapState());

  ipcMain.handle('desktop:save-config', async (_event, input: Partial<DesktopConfig>) => {
    const nextConfig = await saveConfig(input);
    configureOpenAtLogin(nextConfig.openAtLogin);
    return {
      config: nextConfig,
    };
  });

  ipcMain.handle(
    'desktop:request-code',
    async (
      _event,
      input: {
        apiBaseUrl: string;
        webBaseUrl: string;
        email: string;
        deviceName: string;
      },
    ) => {
      const apiBaseUrl = requireNonEmptyDesktopField(input.apiBaseUrl, 'API base URL');
      const webBaseUrl = requireNonEmptyDesktopField(input.webBaseUrl, 'Web base URL');
      const email = requireNonEmptyDesktopField(input.email, 'Email');
      const deviceName = requireNonEmptyDesktopField(
        input.deviceName || defaultConfig.deviceName,
        'Device name',
      );

      await saveConfig({
        apiBaseUrl,
        webBaseUrl,
        email,
        deviceName,
      });

      const payload = await postJson<RequestCodeResponse>(apiBaseUrl, '/auth/request-code', {
        email,
      });

      appendLog('[DESKTOP] verification_code_requested');
      return payload;
    },
  );

  ipcMain.handle(
    'desktop:login',
    async (
      _event,
      input: {
        apiBaseUrl: string;
        webBaseUrl: string;
        email: string;
        code: string;
        deviceName: string;
        openAtLogin: boolean;
        autoStartOnLaunch: boolean;
      },
    ) => {
      const apiBaseUrl = requireNonEmptyDesktopField(input.apiBaseUrl, 'API base URL');
      const webBaseUrl = requireNonEmptyDesktopField(input.webBaseUrl, 'Web base URL');
      const email = requireNonEmptyDesktopField(input.email, 'Email');
      const deviceName = requireNonEmptyDesktopField(
        input.deviceName || defaultConfig.deviceName,
        'Device name',
      );
      const code = requireNonEmptyDesktopField(input.code, 'Verification code');

      const { statePath } = getPaths();
      const config = await saveConfig({
        apiBaseUrl,
        webBaseUrl,
        email,
        deviceName,
        openAtLogin: input.openAtLogin,
        autoStartOnLaunch: input.autoStartOnLaunch,
      });
      configureOpenAtLogin(config.openAtLogin);

      const payload = await postJson<ReminderLoginResponse>(
        config.apiBaseUrl,
        '/auth/reminder/verify-code',
        {
          email: config.email,
          code,
          deviceName: config.deviceName,
        },
      );

      await saveReminderSession(statePath, {
        apiBaseUrl: config.apiBaseUrl,
        deviceName: payload.deviceName,
        deviceToken: payload.deviceToken,
        deviceTokenId: payload.deviceTokenId,
        user: payload.user,
        savedAt: new Date().toISOString(),
      });

      appendLog('[DESKTOP] reminder_login_success');
      await startReminderProcess();
      return getBootstrapState();
    },
  );

  ipcMain.handle('desktop:start-runtime', async () => {
    await startReminderProcess();
    return getBootstrapState();
  });

  ipcMain.handle('desktop:stop-runtime', async () => {
    await stopReminderProcess();
    return getBootstrapState();
  });

  ipcMain.handle('desktop:logout', async () => {
    const { statePath } = getPaths();
    await stopReminderProcess();
    await rm(statePath, { force: true });
    appendLog('[DESKTOP] reminder_session_removed');
    return getBootstrapState();
  });

  ipcMain.handle('desktop:open-data-dir', async () => {
    await shell.openPath(getPaths().userDataDir);
    return true;
  });
}

async function createDesktopApp(): Promise<void> {
  await ensureUserDataDir();
  registerIpcHandlers();

  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  tray = createTrayIcon();
  mainWindow = createWindow();
  updateTrayMenu();

  tray.on('click', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isVisible()) {
      mainWindow.hide();
      return;
    }

    showWindow();
  });

  const config = await loadConfig();
  configureOpenAtLogin(config.openAtLogin);
  const sessionExists = await fileExists(getPaths().statePath);

  if (config.autoStartOnLaunch && sessionExists) {
    try {
      await startReminderProcess();
    } catch (error) {
      appendLog(
        `[DESKTOP] autostart_failed ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } else {
    showWindow();
  }
}

app.on('before-quit', () => {
  isQuitting = true;
});

void app.whenReady().then(() => createDesktopApp());

app.on('activate', () => {
  if (!mainWindow) {
    mainWindow = createWindow();
    return;
  }

  showWindow();
});

app.on('window-all-closed', () => {});
