# 🔍 Hallucination Detector

> A Chrome extension that automatically fact-checks AI responses in real time — right inside ChatGPT, Claude, Gemini, and any AI platform you use.

## What it actually does

You're chatting with an AI. It gives you a confident-sounding answer. But is it true?

Hallucination Detector sits silently in your browser and the moment an AI responds, it:

1. Breaks the response into individual checkable facts
2. Searches the web for real sources on each one
3. Compares what the AI said against what the sources actually say
4. Injects a trust panel directly below the response — green, orange, or red

No copy-pasting. No switching tabs. No extra steps. It just works.

---

## Demo

![Demo GIF](demo.gif)

> *Coming soon — recording in progress*

---

## The Deception Gap

This is the thing we're most proud of.

Most fact-checkers just tell you something is wrong. We also measure **how confidently wrong** the AI was — the gap between how certain it sounded versus how supported its claims actually are.

```
AI tone confidence    →  92%
Evidence support      →  31%
──────────────────────────────
Deception Gap         →  61% ⚠️
```

A high deception gap means the AI is confidently hallucinating — which is honestly the most dangerous kind.

---

## Hallucination types we detect

We don't just say "wrong" — we tell you *how* it's wrong:

| Type | What it means |
|---|---|
| **Temporal Drift** | Correct fact, wrong time period |
| **Entity Confusion** | Real person or thing, wrong attributes |
| **Citation Fabrication** | Source exists but the quote is invented |
| **Statistical Distortion** | Real statistic, wrong number |
| **Complete Fabrication** | The thing doesn't exist at all |

---

## Tech stack

**Extension**
- Vanilla JavaScript
- Chrome Manifest V3
- MutationObserver for real-time response detection

**Backend**
- Node.js + Express
- Groq API (Llama 3.3 70B) as primary LLM — with Gemini Flash as fallback
- Serper.dev for live web search
- In-memory cache to keep API calls low
- Upstash Redis for persistent caching across sessions


## How it works under the hood

```
AI responds on page
      ↓
content.js detects new response via MutationObserver
      ↓
Waits 2 seconds to confirm response is complete
      ↓
POST /api/verify → Node.js backend
      ↓
Groq extracts atomic claims from the text
      ↓
Serper searches the web for each claim (max 5)
      ↓
Groq reads the search results and scores each claim
      ↓
Deception gap + trust score calculated
      ↓
Trust panel injected back into the page
```

The whole thing runs in about 3-4 seconds.

---

## Getting started

### Prerequisites

- Node.js 18+
- Chrome browser
- Free API keys from:
  - [Groq](https://console.groq.com) — primary LLM
  - [Google AI Studio](https://aistudio.google.com) — fallback LLM
  - [Serper.dev](https://serper.dev) — web search

### 1. Clone the repo

```bash
git clone https://github.com/yourteam/hallucination-detector
cd hallucination-detector
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` folder:

```
GROQ_KEY=your_groq_key_here
GEMINI_KEY=your_gemini_key_here
SERPER_KEY=your_serper_key_here
UPSTASH_URL=your_upstash_url_here
UPSTASH_TOKEN=your_upstash_token_here
```

Start the server:

```bash
node server.js
```

You should see `Server running on port 3000`. Keep this terminal open.

### 3. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. The 🔍 icon will appear in your toolbar

### 4. Try it out

Go to [chatgpt.com](https://chatgpt.com) and ask something factual — like:

> *"Tell me about Albert Einstein's early life"*

Wait for the response. Within a few seconds you'll see the trust panel appear below it.

---

## Project structure

```
hallucination-detector/
├── extension/
│   ├── manifest.json       ← Chrome extension config
│   ├── content.js          ← Detects responses, injects UI
│   ├── background.js       ← Service worker, settings
│   └── popup.html          ← Toolbar popup UI
│
└── backend/
    ├── server.js           ← Express server entry point
    ├── .env                ← Your API keys (never commit this)
    ├── routes/
    │   └── verify.js       ← POST /api/verify endpoint
    └── services/
        ├── llm.js          ← Groq + Gemini fallback
        ├── extractor.js    ← Pulls atomic claims from text
        ├── searcher.js     ← Brave search + caching
        ├── verdict.js      ← Scores each claim vs evidence
        ├── summary.js      ← Trust score + deception gap
        └── cache.js        ← In-memory + Redis cache layer
```

---

## API reference

### `POST /api/verify`

Verifies a piece of text for hallucinations.

**Request:**
```json
{
  "text": "Einstein failed math in school and won the Nobel Prize in 1925."
}
```

**Response:**
```json
{
  "original_text": "Einstein failed math in school...",
  "claims": [
    {
      "claim": "Einstein failed math in school",
      "verdict": "CONTRADICT",
      "type": "Entity Confusion",
      "confidence": 96,
      "reasoning": "Multiple sources confirm Einstein excelled at mathematics",
      "sources": ["https://wikipedia.org/...", "https://britannica.com/..."]
    },
    {
      "claim": "Einstein won the Nobel Prize in 1925",
      "verdict": "CONTRADICT",
      "type": "Temporal Drift",
      "confidence": 97,
      "reasoning": "Einstein won the Nobel Prize in 1921, not 1925",
      "sources": ["https://nobelprize.org/..."]
    }
  ],
  "summary": {
    "trust_score": 0,
    "deception_gap": 61,
    "overall_label": "UNRELIABLE",
    "hallucination_types": ["Entity Confusion", "Temporal Drift"]
  }
}
```

### `GET /health`

Returns `{ "status": "ok" }` — used by the extension popup to check if the backend is running.

---

## Supported platforms

| Platform | Status |
|---|---|
| ChatGPT | ✅ Working |
| Claude.ai | ✅ Working |
| Gemini | ✅ Working |

