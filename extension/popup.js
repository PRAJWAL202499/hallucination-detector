// ─── Hallucination Detector — popup.js ───────────────────────────────────────

const BACKEND_URL = 'http://localhost:3000';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const toggle       = document.getElementById('enableToggle');
const statusText   = document.getElementById('statusText');
const checksEl     = document.getElementById('checksToday');
const avgEl        = document.getElementById('avgTrust');
const backendDot   = document.getElementById('backendDot');
const backendText  = document.getElementById('backendText');
const themeBtn     = document.getElementById('themeToggle');

// ─── Theme helpers ─────────────────────────────────────────────────────────────

function applyTheme(theme) {
  // theme: 'dark' | 'light'
  document.documentElement.setAttribute('data-theme', theme);
  themeBtn.textContent  = theme === 'dark' ? '☀️' : '🌙';
  themeBtn.title        = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(enabled) {
  statusText.textContent = enabled ? 'Active' : 'Paused';
  statusText.className   = `hd-status-text ${enabled ? 'active' : 'paused'}`;
  toggle.checked = enabled;
}

function setBackendStatus(online) {
  backendDot.className    = `hd-dot ${online ? 'online' : 'offline'}`;
  backendText.textContent = online ? 'Backend online' : 'Backend offline';
}

// ─── 1. Load settings from storage ───────────────────────────────────────────

chrome.storage.local.get(
  ['enabled', 'checksToday', 'avgTrustScore', 'theme'],
  (data) => {
    // Extension enabled/disabled
    const enabled = data.enabled !== false; // default true
    setStatus(enabled);

    // Stats
    checksEl.textContent = data.checksToday  ?? '0';
    avgEl.textContent    = data.avgTrustScore != null
      ? Math.round(data.avgTrustScore)
      : '—';

    // Theme — use stored pref, else fall back to system preference
    const theme = data.theme || getSystemTheme();
    applyTheme(theme);
  }
);

// ─── 2. Backend health check ──────────────────────────────────────────────────

(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(4000) });
    setBackendStatus(res.ok);
  } catch {
    setBackendStatus(false);
  }
})();

// ─── 3. Toggle handler ────────────────────────────────────────────────────────

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;

  // Persist to storage
  chrome.storage.local.set({ enabled });

  // Update UI immediately
  setStatus(enabled);

  // Notify the active tab's content script
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_EXTENSION', enabled }).catch(() => {
        // Content script may not be injected on this tab — safe to ignore
      });
    }
  } catch {
    // Non-fatal
  }
});

// ─── 4. Dark / Light mode toggle ─────────────────────────────────────────────

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || getSystemTheme();
  const next    = current === 'dark' ? 'light' : 'dark';

  applyTheme(next);
  chrome.storage.local.set({ theme: next });
});
