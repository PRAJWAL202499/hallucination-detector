// ─── Hallucination Detector — background.js (MV3 Service Worker) ─────────────

const DEFAULT_SETTINGS = {
  enabled: true,
  backendUrl: 'http://localhost:3000',
};

const AI_DOMAINS = ['chatgpt.com', 'claude.ai', 'gemini.google.com'];

// ─── 1. Install Event ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[HallucinationDetector] Hallucination Detector is active');
    chrome.storage.local.set(DEFAULT_SETTINGS);
  }
});

// ─── 2. Message Listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // ── GET_SETTINGS ──────────────────────────────────────────────────────────
    case 'GET_SETTINGS': {
      chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (settings) => {
        sendResponse(settings);
      });
      break;
    }

    // ── VERIFY_TEXT (fallback if content.js fetch fails) ──────────────────────
    case 'VERIFY_TEXT': {
      chrome.storage.local.get(['backendUrl', 'enabled'], async (settings) => {
        if (!settings.enabled) {
          sendResponse({ error: 'Extension is disabled' });
          return;
        }

        const backendUrl = settings.backendUrl || DEFAULT_SETTINGS.backendUrl;

        try {
          const res = await fetch(`${backendUrl}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message.text }),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = await res.json();
          sendResponse(data);
        } catch (err) {
          console.error('[HallucinationDetector] VERIFY_TEXT failed:', err.message);
          sendResponse({ error: err.message });
        }
      });
      break;
    }

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }

  // Keep message channel open for async sendResponse calls
  return true;
});

// ─── 3. Tab Update Listener ───────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const isAIPlatform = AI_DOMAINS.some((domain) => tab.url.includes(domain));

  if (isAIPlatform) {
    console.log(`[HallucinationDetector] AI platform detected: ${tab.url}`);
  }
});
