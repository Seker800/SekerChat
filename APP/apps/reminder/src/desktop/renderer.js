const runtimeBadge = document.getElementById('runtime-badge');
const sessionBadge = document.getElementById('session-badge');
const apiBaseUrlInput = document.getElementById('api-base-url');
const webBaseUrlInput = document.getElementById('web-base-url');
const emailInput = document.getElementById('email');
const deviceNameInput = document.getElementById('device-name');
const codeInput = document.getElementById('code');
const autoStartOnLaunchInput = document.getElementById('auto-start-on-launch');
const openAtLoginInput = document.getElementById('open-at-login');
const feedback = document.getElementById('feedback');
const requestResult = document.getElementById('request-result');
const statePath = document.getElementById('state-path');
const logOutput = document.getElementById('log-output');

const requestCodeButton = document.getElementById('request-code-button');
const saveConfigButton = document.getElementById('save-config-button');
const loginButton = document.getElementById('login-button');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const logoutButton = document.getElementById('logout-button');
const openDataDirButton = document.getElementById('open-data-dir-button');
const clearLogButton = document.getElementById('clear-log-button');

function getConfigFromForm() {
  return {
    apiBaseUrl: apiBaseUrlInput.value.trim(),
    webBaseUrl: webBaseUrlInput.value.trim(),
    email: emailInput.value.trim(),
    deviceName: deviceNameInput.value.trim(),
    openAtLogin: openAtLoginInput.checked,
    autoStartOnLaunch: autoStartOnLaunchInput.checked,
  };
}

function setFeedback(message, tone = 'info') {
  feedback.textContent = message;
  feedback.dataset.tone = tone;
}

function appendLog(line) {
  if (!line) {
    return;
  }

  const next = `${line}\n`;
  logOutput.textContent = `${logOutput.textContent}${next}`.trimEnd();
  logOutput.scrollTop = logOutput.scrollHeight;
}

function renderRuntime(runtime) {
  const running = Boolean(runtime?.running);
  runtimeBadge.textContent = running ? '运行中' : '未运行';
  runtimeBadge.className = running ? 'badge badge-running' : 'badge badge-idle';

  startButton.disabled = running;
  stopButton.disabled = !running;
}

function renderSession(sessionExists) {
  sessionBadge.textContent = sessionExists ? '已登录' : '未登录';
  logoutButton.disabled = !sessionExists;
}

function applyBootstrap(state) {
  const { config, runtime, sessionExists, statePath: nextStatePath, logs } = state;
  apiBaseUrlInput.value = config.apiBaseUrl || '';
  webBaseUrlInput.value = config.webBaseUrl || '';
  emailInput.value = config.email || '';
  deviceNameInput.value = config.deviceName || '';
  autoStartOnLaunchInput.checked = config.autoStartOnLaunch !== false;
  openAtLoginInput.checked = Boolean(config.openAtLogin);
  statePath.textContent = nextStatePath;
  renderRuntime(runtime);
  renderSession(sessionExists);
  logOutput.textContent = Array.isArray(logs) ? logs.join('\n') : '';
}

async function refresh() {
  const state = await window.reminderDesktop.bootstrap();
  applyBootstrap(state);
}

async function handleRequestCode() {
  if (!apiBaseUrlInput.value.trim() || !emailInput.value.trim()) {
    setFeedback('服务地址和邮箱不能为空。', 'error');
    return;
  }

  requestCodeButton.disabled = true;
  setFeedback('正在请求验证码...');

  try {
    const result = await window.reminderDesktop.requestCode(getConfigFromForm());
    const codeText =
      result && typeof result.code === 'string'
        ? `开发环境验证码：${result.code}`
        : '验证码已请求，请查看你的投递渠道。';
    requestResult.textContent = codeText;
    setFeedback('验证码请求成功。', 'success');
    await refresh();
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : '请求验证码失败。', 'error');
  } finally {
    requestCodeButton.disabled = false;
  }
}

async function handleSaveConfig() {
  saveConfigButton.disabled = true;
  setFeedback('正在保存配置...');

  try {
    await window.reminderDesktop.saveConfig(getConfigFromForm());
    setFeedback('配置已保存。', 'success');
    await refresh();
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : '保存配置失败。', 'error');
  } finally {
    saveConfigButton.disabled = false;
  }
}

async function handleLogin() {
  if (!apiBaseUrlInput.value.trim() || !webBaseUrlInput.value.trim() || !emailInput.value.trim()) {
    setFeedback('服务地址、网页地址和邮箱不能为空。', 'error');
    return;
  }

  if (!codeInput.value.trim()) {
    setFeedback('验证码不能为空。', 'error');
    return;
  }

  loginButton.disabled = true;
  setFeedback('正在登录 reminder 并启动常驻服务...');

  try {
    const state = await window.reminderDesktop.login({
      ...getConfigFromForm(),
      code: codeInput.value.trim(),
    });
    applyBootstrap(state);
    codeInput.value = '';
    setFeedback('登录成功，提醒服务已开始常驻。', 'success');
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : '登录失败。', 'error');
  } finally {
    loginButton.disabled = false;
  }
}

async function handleStart() {
  startButton.disabled = true;
  setFeedback('正在启动提醒服务...');

  try {
    const state = await window.reminderDesktop.startRuntime();
    applyBootstrap(state);
    setFeedback('提醒服务已启动。', 'success');
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : '启动失败。', 'error');
  } finally {
    startButton.disabled = false;
  }
}

async function handleStop() {
  stopButton.disabled = true;
  setFeedback('正在停止提醒服务...');

  try {
    const state = await window.reminderDesktop.stopRuntime();
    applyBootstrap(state);
    setFeedback('提醒服务已停止。', 'success');
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : '停止失败。', 'error');
  } finally {
    stopButton.disabled = false;
  }
}

async function handleLogout() {
  logoutButton.disabled = true;
  setFeedback('正在移除本地登录状态...');

  try {
    const state = await window.reminderDesktop.logout();
    applyBootstrap(state);
    setFeedback('本地登录状态已移除。', 'success');
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : '移除登录状态失败。', 'error');
  } finally {
    logoutButton.disabled = false;
  }
}

requestCodeButton.addEventListener('click', handleRequestCode);
saveConfigButton.addEventListener('click', handleSaveConfig);
loginButton.addEventListener('click', handleLogin);
startButton.addEventListener('click', handleStart);
stopButton.addEventListener('click', handleStop);
logoutButton.addEventListener('click', handleLogout);
openDataDirButton.addEventListener('click', () => {
  void window.reminderDesktop.openDataDir();
});
clearLogButton.addEventListener('click', () => {
  logOutput.textContent = '';
});

window.reminderDesktop.onRuntimeEvent((payload) => {
  if (payload.type === 'log' && typeof payload.line === 'string') {
    appendLog(payload.line);
    return;
  }

  if (payload.type === 'runtime-state' && payload.runtime) {
    renderRuntime(payload.runtime);
  }
});

void refresh();
