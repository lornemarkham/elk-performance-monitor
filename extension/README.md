# ELK Performance Monitor — Chrome extension

Manifest V3 extension that injects a **right-docked, dark-themed** panel and captures **parent-page** network and runtime error signals. Panel styles live in a **Shadow DOM** so they do not inherit or leak with the host page’s CSS.

## Phase 2 scope (honest instrumentation)

- **`window.fetch`** and **`XMLHttpRequest`** wrapped in the **page** realm (see bridge note below).
- **`window` `error`** (capture) and **`unhandledrejection`**.
- **No** distributed tracing, **no** AI, **no** iframe lifecycle story unless we later detect it for real.
- **No** popup, devtools panel, persistence, or export.

### Captured request fields

| Field | Meaning |
|--------|---------|
| `id` | Stable row id from the page script |
| `method` | HTTP method |
| `url` | Resolved absolute URL |
| `startTime` / `endTime` | Wall-clock ms (`Date.now()`) at start / completion |
| `durationMs` | `endTime - startTime` (rounded, ≥ 0) |
| `status` | HTTP status when available; `null` on network failure |
| `success` | `true` when the call is treated as successful (Fetch: `response.ok`; XHR: status 2xx) |
| `requestKind` | Coarse label: **`api-bff`**, **`frontend`**, **`external`**, **`unknown`** (same-origin path heuristics only; cross-origin → `external`) |

### Captured error fields

| Field | Meaning |
|--------|---------|
| `id` | Row id |
| `type` | **`runtime-error`** or **`unhandled-rejection`** |
| `message` | Short message |
| `stack` | Stack string when available (`Error.stack`), else `null` |
| `timestamp` | Wall-clock ms (`Date.now()`) |

Bridge envelope: `channel: elk-perf-monitor-page-v1`, **`v: 2`** (see `bridge-protocol.ts`).

## File structure

```text
performance-monitor-extension/
  public/manifest.json
  src/
    content.tsx              # Content script: inject page-world, message bridge, React + Shadow DOM
    ExtensionPanel.tsx       # Shell (minimize / close / FAB)
    InstrumentationBody.tsx  # Stats, request list, error list
    panel.css
    bridge-protocol.ts       # Envelope + payload types + isPageBridgeEnvelope
    page-world.ts            # → page-world.js (page context only)
    inject-page-world.ts
    instrumentation-store.ts
    vite-env.d.ts
  vite.config.ts
  vite.page.config.ts
  dist/                      # Load unpacked from here
```

## Why content scripts are isolated

Chrome runs content scripts in a **separate JavaScript world** from the page: they see the **same DOM**, but **not** the same `window`, globals, or prototypes as scripts loaded by the site. A `fetch` patch installed only in the content script **does not** wrap calls made by the page’s own code.

## Why fetch / XHR patching uses a page-context script

The page’s network calls run in the **page realm**. We inject **`page-world.js`** via a normal `<script src="chrome-extension://…">` (declared in **`web_accessible_resources`**) so patches apply to **that** `window.fetch` / `XMLHttpRequest`. Events are sent to the extension with **`window.postMessage`**.

## How events flow into the panel

```text
Site code (page realm)
        │
        ▼
page-world.js — wraps fetch / XHR; listens error + unhandledrejection
        │ window.postMessage({ channel, v: 2, kind, payload }, '*')
        ▼
content.js — isolated realm
        │ addEventListener('message'): require event.source === window
        │ isPageBridgeEnvelope(data) → instrumentation-store
        ▼
React (Shadow DOM) — useInstrumentation() → UI lists + counts
```

The content script **never** trusts arbitrary messages: it requires **`event.source === window`** (top-level frame) and a matching **channel + protocol version**.

## Permissions (`host_permissions`)

The manifest declares **narrow http(s) access**:

```json
"host_permissions": ["http://*/*", "https://*/*"]
```

**Why:** In Manifest V3 this makes host access explicit for the extension. It matches the same origins as **`content_scripts.matches`** and **`web_accessible_resources`** — we only target **http** and **https**, not `<all_urls>`, **`file://`**, etc.

**What we do not request:** `tabs`, `storage`, `cookies`, `scripting` (no programmatic injection API), `webRequest`, broad `<all_urls>`, or any permission beyond what’s needed to run the content script, inject the packaged **`page-world.js`** from `chrome-extension://`, and receive **`postMessage`** from the page.

Chrome may still show a summary like “read and change data on sites” for http(s) — that is expected for this pattern.

## Page script: safe, once-per-page injection

`inject-page-world.ts`:

- Skips if a prior loader tag exists: `script[data-elk-perf-page-world]`.
- Sets **`data-elk-perf-page-world-pending`** on `<html>` while the tag is loading so a second attempt cannot queue another tag in the same tick.
- Uses **`document.createElement('script')`** + **`src`** only (no inline script body, no `eval`).
- Clears pending on **`load`**; on **`error`** (e.g. blocked load), removes the tag, clears pending, and allows a future attempt after navigation/reload.
- Sets **`referrerPolicy="no-referrer"`** on the tag.

## Build

```bash
# repo root
npm install && npm run build:extension

# or this package
cd performance-monitor-extension && npm install && npm run build
```

Two Vite passes: `content.js` (React + panel CSS inline), then `page-world.js` appended to `dist/`.

## Load in Chrome

1. Build → open `chrome://extensions` → **Developer mode** → **Load unpacked** → select **`dist/`**.

## How to test

Rebuild and click **Reload** on the extension card after each `npm run build` so `content.js` / `page-world.js` stay in sync.

### A) Simple website (mostly static)

1. Open **`https://example.com`** (or similar).
2. Expect **Total calls** at **0** or a small number (favicon / optional beacon). **Requests** may be empty — that is a valid empty-ish state.
3. Open DevTools → **Console** and run:  
   `fetch('https://example.com')`  
   You should see at least one new row (likely **External** or **Unknown** depending on URL), **duration**, and timestamps.

### B) App-like website (lots of fetch/XHR)

1. Open a heavy SPA you use over **https** (e.g. a mail client, dashboard, or social feed).
2. Hard refresh once. **Total calls** should climb as the app loads; the list shows **API/BFF**, **Frontend**, **External**, etc., as heuristics allow.
3. Interact (open a view, trigger pagination) and confirm new rows appear without reloading the extension.

### C) Forced runtime error (sanity check)

1. Stay on any **https** page where the panel shows and DevTools console runs page code in the **page** context (default).
2. Run:  
   `throw new Error('elk-perf-test')`  
3. Expect **Page errors** ≥ **1** and an **Errors** row typed **Runtime error** with your message (and **stack** if the engine attaches one).
4. Optional:  
   `Promise.reject(new Error('elk-perf-rejection'))`  
   → **Unhandled rejection** row.

**CSP / Trusted Types:** Some sites block extension script loads; the panel may appear with **no** captured traffic. That is an environment limit, not fabricated tracing.

## Phase 1 recap

The panel still supports **open / minimize / close** and a **FAB** when closed.

## Main app

The Elk Garden **frontend** Vite config is unchanged; only this package’s Vite configs build the extension.
