// ─── Hallucination Detector — content.js ─────────────────────────────────────

const BACKEND_URL = 'http://localhost:3000/verify';

const SELECTORS = [
  'div[data-message-author-role="assistant"]', // ChatGPT
  'div.font-claude-message',                    // Claude
  'div.response-content',                       // Gemini
];

// ─── Enabled state (synced from storage) ─────────────────────────────────────

let extensionEnabled = true;

chrome.storage.local.get(['enabled'], (data) => {
  if (data.enabled !== undefined) extensionEnabled = data.enabled;
});

// Listen for toggle messages from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_EXTENSION') {
    extensionEnabled = message.enabled;
  }
});

// ─── Stats tracking ───────────────────────────────────────────────────────────

function updateStats(trustScore) {
  const today = new Date().toDateString();
  chrome.storage.local.get(['checksToday', 'avgTrustScore', 'statsDate'], (data) => {
    // Reset daily stats if the date changed
    const isSameDay = data.statsDate === today;
    const prevChecks = isSameDay ? (data.checksToday ?? 0) : 0;
    const prevAvg    = isSameDay ? (data.avgTrustScore ?? 0) : 0;

    const newChecks = prevChecks + 1;
    const newAvg    = Math.round(((prevAvg * prevChecks) + trustScore) / newChecks);

    chrome.storage.local.set({
      checksToday:   newChecks,
      avgTrustScore: newAvg,
      statsDate:     today,
    });
  });
}

// ─── Deduplication ────────────────────────────────────────────────────────────

const verifiedIds = new Set();

function hashText(text) {
  const sample = text.slice(0, 100);
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = (Math.imul(31, hash) + sample.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  return darkMQ.matches;
}

function getTheme() {
  return isDark()
    ? {
        panelBg: '#1f2937',
        panelBorder: '#374151',
        textPrimary: '#f9fafb',
        textSecondary: '#9ca3af',
        claimBg: '#111827',
      }
    : {
        panelBg: '#ffffff',
        panelBorder: '#e5e7eb',
        textPrimary: '#111827',
        textSecondary: '#6b7280',
        claimBg: '#f9fafb',
      };
}

function trustColor(score) {
  if (score >= 75) return '#16a34a';
  if (score >= 45) return '#d97706';
  return '#dc2626';
}

function verdictStyle(verdict) {
  const map = {
    SUPPORT:     { bg: '#16a34a', text: '#ffffff' },
    CONTRADICT:  { bg: '#dc2626', text: '#ffffff' },
    NOT_ADDRESS: { bg: '#6b7280', text: '#ffffff' },
  };
  return map[verdict] || map['NOT_ADDRESS'];
}

// ─── Styles injected once ─────────────────────────────────────────────────────

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes hd-fadein {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .hd-panel {
      animation: hd-fadein 0.3s ease forwards;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      line-height: 1.5;
      border-radius: 10px;
      max-width: 680px;
      margin-top: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
    }
    .hd-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      cursor: pointer;
      user-select: none;
      gap: 12px;
    }
    .hd-header-left { display: flex; align-items: center; gap: 10px; }
    .hd-toggle { font-size: 11px; opacity: 0.6; }
    .hd-body   { padding: 0 14px 14px; }
    .hd-score  { font-size: 22px; font-weight: 700; }
    .hd-label  { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 20px; }
    .hd-gap    { font-size: 12px; margin: 8px 0 12px; }
    .hd-claim  { border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .hd-claim-top { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
    .hd-claim-text { flex: 1; min-width: 0; }
    .hd-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 20px; white-space: nowrap; margin-top: 2px; }
    .hd-meta  { font-size: 11px; margin-top: 4px; opacity: 0.75; }
    .hd-sources-toggle { font-size: 11px; cursor: pointer; margin-top: 6px; text-decoration: underline; opacity: 0.65; display: inline-block; }
    .hd-sources { margin-top: 6px; padding-left: 14px; }
    .hd-sources li { font-size: 11px; word-break: break-all; }
    .hd-sources a { color: inherit; }
    .hd-loading {
      display: inline-flex; align-items: center; gap: 6px;
      background: #e5e7eb; color: #374151;
      border-radius: 20px; padding: 6px 12px;
      font-size: 12px; margin-top: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
  `;
  document.head.appendChild(style);
}

// ─── Loading badge ────────────────────────────────────────────────────────────

function createLoadingBadge() {
  ensureStyles();
  const el = document.createElement('div');
  el.className = 'hd-loading';
  el.setAttribute('data-hd-badge', '1');
  el.innerHTML = `<span>🔍</span><span>Checking for hallucinations…</span>`;
  return el;
}

// ─── Panel builder ────────────────────────────────────────────────────────────

const allPanels = new Set(); // track for theme updates

function applyThemeToPanel(panel, data) {
  const t = getTheme();
  const summary = data.summary ?? {};
  const score = summary.trust_score ?? data.trust_score ?? data.trustScore ?? 0;
  const color = trustColor(score);
  const label = summary.overall_label ?? (score >= 75 ? 'TRUSTWORTHY' : score >= 45 ? 'MIXED' : 'UNRELIABLE');
  const labelBg = score >= 75 ? '#dcfce7' : score >= 45 ? '#fef3c7' : '#fee2e2';
  const labelColor = score >= 75 ? '#15803d' : score >= 45 ? '#b45309' : '#b91c1c';
  const gap = summary.deception_gap ?? data.deception_gap ?? data.deceptionGap ?? null;
  const claims = data.claims ?? [];

  panel.style.background = t.panelBg;
  panel.style.border = `1px solid ${t.panelBorder}`;
  panel.style.borderLeft = `4px solid ${color}`;
  panel.style.color = t.textPrimary;

  const header = panel.querySelector('.hd-header');
  if (header) header.style.borderBottom = `1px solid ${t.panelBorder}`;

  const scoreEl = panel.querySelector('.hd-score');
  if (scoreEl) scoreEl.style.color = color;

  const labelEl = panel.querySelector('.hd-label');
  if (labelEl) {
    labelEl.style.background = labelBg;
    labelEl.style.color = labelColor;
    labelEl.textContent = label;
  }

  const gapEl = panel.querySelector('.hd-gap');
  if (gapEl) gapEl.style.color = t.textSecondary;

  panel.querySelectorAll('.hd-claim').forEach((card, i) => {
    card.style.background = t.claimBg;
    const metaEl = card.querySelector('.hd-meta');
    if (metaEl) metaEl.style.color = t.textSecondary;
    const textEl = card.querySelector('.hd-claim-text');
    if (textEl) textEl.style.color = t.textPrimary;
  });

  const toggle = panel.querySelector('.hd-toggle');
  if (toggle) toggle.style.color = t.textSecondary;
}

function buildPanel(data) {
  ensureStyles();
  const t = getTheme();
  const summary = data.summary ?? {};
  const score = summary.trust_score ?? data.trust_score ?? data.trustScore ?? 0;
  const color = trustColor(score);
  const label = summary.overall_label ?? (score >= 75 ? 'TRUSTWORTHY' : score >= 45 ? 'MIXED' : 'UNRELIABLE');
  const labelBg = score >= 75 ? '#dcfce7' : score >= 45 ? '#fef3c7' : '#fee2e2';
  const labelColor = score >= 75 ? '#15803d' : score >= 45 ? '#b45309' : '#b91c1c';
  const gap = summary.deception_gap ?? data.deception_gap ?? data.deceptionGap ?? null;
  const claims = data.claims ?? [];

  const panel = document.createElement('div');
  panel.className = 'hd-panel';
  panel.setAttribute('data-hd-panel', '1');
  panel.style.cssText = `
    background: ${t.panelBg};
    border: 1px solid ${t.panelBorder};
    border-left: 4px solid ${color};
    color: ${t.textPrimary};
  `;

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'hd-header';
  header.style.borderBottom = `1px solid ${t.panelBorder}`;
  header.innerHTML = `
    <div class="hd-header-left">
      <span class="hd-score" style="color:${color}">${score}</span>
      <span class="hd-label" style="background:${labelBg};color:${labelColor}">${label}</span>
    </div>
    <span class="hd-toggle" style="color:${t.textSecondary}">▲ collapse</span>
  `;

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'hd-body';

  if (gap !== null) {
    const gapEl = document.createElement('div');
    gapEl.className = 'hd-gap';
    gapEl.style.color = t.textSecondary;
    const gapPct = typeof gap === 'number' ? `${Math.round(gap * 100)}%` : gap;
    const warn = (typeof gap === 'number' && gap > 0.30) || (typeof gap === 'string' && parseInt(gap) > 30);
    gapEl.innerHTML = `Deception gap: <strong>${gapPct}</strong>${warn ? ' ⚠️ High deception gap detected' : ''}`;
    body.appendChild(gapEl);
  }

  claims.forEach((claim) => {
    const vs = verdictStyle(claim.verdict);
    const card = document.createElement('div');
    card.className = 'hd-claim';
    card.style.background = t.claimBg;

    const conf = claim.confidence != null ? `${Math.round(claim.confidence * 100)}%` : null;
    const halType = claim.type ?? claim.hallucination_type ?? claim.hallucinationType ?? null;

    card.innerHTML = `
      <div class="hd-claim-top">
        <div class="hd-claim-text" style="color:${t.textPrimary}">${claim.claim ?? claim.text ?? ''}</div>
        <span class="hd-badge" style="background:${vs.bg};color:${vs.text}">${claim.verdict ?? 'UNKNOWN'}</span>
      </div>
      ${halType ? `<div class="hd-meta" style="color:${t.textSecondary}">Type: ${halType}${conf ? ` · Confidence: ${conf}` : ''}</div>` : conf ? `<div class="hd-meta" style="color:${t.textSecondary}">Confidence: ${conf}</div>` : ''}
    `;

    const sources = claim.sources ?? [];
    if (sources.length > 0) {
      const toggle = document.createElement('span');
      toggle.className = 'hd-sources-toggle';
      toggle.textContent = `▶ ${sources.length} source${sources.length > 1 ? 's' : ''}`;

      const list = document.createElement('ul');
      list.className = 'hd-sources';
      list.style.display = 'none';
      sources.forEach((src) => {
        const li = document.createElement('li');
        const url = typeof src === 'string' ? src : src.url ?? src.link ?? JSON.stringify(src);
        const title = typeof src === 'object' ? (src.title ?? url) : url;
        li.innerHTML = `<a href="${url}" target="_blank" rel="noopener">${title}</a>`;
        list.appendChild(li);
      });

      toggle.addEventListener('click', () => {
        const open = list.style.display !== 'none';
        list.style.display = open ? 'none' : 'block';
        toggle.textContent = `${open ? '▶' : '▼'} ${sources.length} source${sources.length > 1 ? 's' : ''}`;
      });

      card.appendChild(toggle);
      card.appendChild(list);
    }

    body.appendChild(card);
  });

  panel.appendChild(header);
  panel.appendChild(body);

  // ── Collapse toggle ──
  let collapsed = false;
  header.addEventListener('click', () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : '';
    header.querySelector('.hd-toggle').textContent = collapsed ? '▼ expand' : '▲ collapse';
    header.style.borderBottom = collapsed ? 'none' : `1px solid ${getTheme().panelBorder}`;
  });

  // Register for theme updates
  panel._hdData = data;
  allPanels.add(panel);

  return panel;
}

// ─── Theme change listener ────────────────────────────────────────────────────

darkMQ.addEventListener('change', () => {
  allPanels.forEach((panel) => {
    if (panel._hdData) applyThemeToPanel(panel, panel._hdData);
  });
});

// ─── Backend call ─────────────────────────────────────────────────────────────

async function verifyResponse(responseText, anchorEl) {
  if (!extensionEnabled) return;

  const id = hashText(responseText);
  if (verifiedIds.has(id)) return;
  verifiedIds.add(id);

  // Loading badge
  const loading = createLoadingBadge();
  anchorEl.appendChild(loading);

  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: responseText }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    loading.remove();
    const panel = buildPanel(data);
    anchorEl.appendChild(panel);

    // Track stats
    const score = (data.summary?.trust_score) ?? data.trust_score ?? data.trustScore ?? 0;
    updateStats(score);
  } catch (err) {
    loading.remove();
    console.warn('[HallucinationDetector] Verification failed:', err);
    // Remove from set so it can be retried on next mutation
    verifiedIds.delete(id);
  }
}

// ─── MutationObserver logic ───────────────────────────────────────────────────

let observer = null;
// responseEl → debounce timer
const debounceMap = new WeakMap();
// responseEl → last seen text (to detect when content has truly settled)
const lastTextMap = new WeakMap();

function getMatchingResponses() {
  const found = [];
  SELECTORS.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => found.push(el));
  });
  return found;
}

function scheduleVerification(el) {
  // Clear existing debounce
  if (debounceMap.has(el)) {
    clearTimeout(debounceMap.get(el));
  }

  const timer = setTimeout(() => {
    debounceMap.delete(el);
    const text = el.innerText?.trim();
    if (!text || text.length < 20) return;

    // Confirm text hasn't changed since we last saw it
    const prev = lastTextMap.get(el);
    if (prev === text) {
      verifyResponse(text, el);
    } else {
      // Text changed — schedule again
      lastTextMap.set(el, text);
      scheduleVerification(el);
    }
  }, 2000);

  lastTextMap.set(el, el.innerText?.trim());
  debounceMap.set(el, timer);
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    getMatchingResponses().forEach((el) => {
      // Skip elements that already have a verified panel or loading badge
      if (el.querySelector('[data-hd-panel]') || el.querySelector('[data-hd-badge]')) return;
      scheduleVerification(el);
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

// ─── SPA navigation handling ──────────────────────────────────────────────────
// ChatGPT / Claude / Gemini are SPAs — watch for URL changes to restart observer

let lastUrl = location.href;

const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Brief delay so new page DOM settles
    setTimeout(startObserver, 800);
  }
});

navObserver.observe(document.body, { childList: true, subtree: true });

// ─── Boot ─────────────────────────────────────────────────────────────────────

startObserver();
