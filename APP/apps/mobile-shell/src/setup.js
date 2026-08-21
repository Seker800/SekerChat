const $ = (sel) => document.querySelector(sel);

const urlInput = $('#url');
const bgToggle = $('#bg-toggle');
const saveBtn = $('#save-btn');
const saveMsg = $('#save-msg');

let bgEnabled = false;

function getPrefs() {
  if (window.Capacitor?.Plugins?.Preferences) {
    return window.Capacitor.Plugins.Preferences;
  }
  return null;
}

async function loadSaved(key) {
  const prefs = getPrefs();
  if (prefs) {
    const r = await prefs.get({ key });
    return r.value || null;
  }
  return localStorage.getItem(key);
}

async function savePref(key, value) {
  const prefs = getPrefs();
  if (prefs) {
    await prefs.set({ key, value });
  }
  localStorage.setItem(key, value);
}

// ---- init ----
(async () => {
  const savedUrl = await loadSaved('sekerchat_url');
  if (savedUrl && !window.location.search.includes('setup')) {
    window.location.replace(savedUrl);
    return;
  }
  if (savedUrl) urlInput.value = savedUrl;

  bgEnabled = (await loadSaved('sekerchat_bg')) === 'true';
  renderToggle();
})();

function renderToggle() {
  bgToggle.classList.toggle('on', bgEnabled);
}

bgToggle.addEventListener('click', () => {
  bgEnabled = !bgEnabled;
  renderToggle();
});

// ---- save ----
saveBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { showMsg('请输入地址', 'error'); return; }

  try { new URL(url); } catch { showMsg('地址格式错误', 'error'); return; }

  await savePref('sekerchat_url', url);
  await savePref('sekerchat_bg', bgEnabled ? 'true' : 'false');

  showMsg('已保存，进入中...', 'success');
  setTimeout(() => { window.location.replace(url); }, 500);
});

function showMsg(text, cls) {
  saveMsg.textContent = text;
  saveMsg.className = cls;
}
