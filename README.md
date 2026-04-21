# ELK Performance Monitor

Chrome extension plus a small **mock stack** (parent page, Eleos-style iframe, API) used to demo **embedded-app** performance: postMessage flows, network calls, errors, navigation timing, and **Eleos referral SLOs** (evaluation lives in the extension; definitions mirror product defaults).

## What’s in this repo

| Path | Role |
|------|------|
| `extension/` | Chrome extension (MV3): instrumentation UI, session health, SLO evaluation (`extension/src/slo/`), shadow-DOM panel (~560px wide for demos). |
| `packages/elk-monitor-core/` | Shared **event/contract** types and validation — keep this focused on the bridge protocol, not SLO math. |
| `mock-parent/` | Vite host app (port **5173**) that embeds the iframe and drives demo traffic. |
| `mock-eleos-iframe/` | Vite “Eleos” iframe (port **5174**): postMessage + API calls to the mock API. |
| `mock-api/` | Express mock API (port **4010**), CORS-enabled for local demos. |
| `docs/` | Design notes and roadmap (non-normative). |

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **Google Chrome** (Chromium) for loading the unpacked extension

## First-time setup (new machine)

From the repo root, install dependencies in each part you use (no root `npm install` is required):

```bash
cd extension && npm install && cd ..
cd mock-api && npm install && cd ..
cd mock-parent && npm install && cd ..
cd mock-eleos-iframe && npm install && cd ..
cd packages/elk-monitor-core && npm install && cd ../..
```

Optional: build the shared package when you change it:

```bash
npm run build --prefix packages/elk-monitor-core
```

Build the extension after UI or logic changes:

```bash
npm run build --prefix extension
```

## Run the full local demo

Use **four terminals** (or tmux panes):

1. **Mock API** — `npm start --prefix mock-api` (listens on **4010**)
2. **Iframe app** — `npm run dev --prefix mock-eleos-iframe` (**5174**)
3. **Parent host** — `npm run dev --prefix mock-parent` (**5173**)
4. **Extension** — after `npm run build --prefix extension`, in Chrome go to `chrome://extensions`, enable **Developer mode**, **Load unpacked**, choose `extension/dist` (the build output; path must stay stable after rebuilds).

Then open **http://localhost:5173** in Chrome, interact with the page/iframe, and open the extension panel to see the **Overview / SLOs / Timeline** tabs and the sticky command bar (health, Eleos label, session line, failed SLO names, audience toggle).

Convenience scripts from repo root (after the one-time `npm install` in each package):

```bash
npm run demo:api
npm run demo:iframe
npm run demo:parent
npm run build:extension
```

## Extension UI (demo-oriented)

- **Sticky header**: combined health, **Eleos**, short session summary, failed SLO names, **Developer | Product | Business** (drives explanation copy).
- **Overview**: health card, 3–5 issue bullets, **one** narrative block for the selected audience.
- **SLOs**: all SLO rows here; collapsed by default (name, actual vs target, PASS / FAIL / LIMITED SAMPLE); expand for technical + business + supporting data.
- **Timeline**: compact load + stats, optional **Session summary** `<details>`, story + requests (with filters) + errors + messages — narrative text is intentionally **not** duplicated here (pointer to Overview).

## Architecture notes

- **SLO definitions and `evaluateSlos`** stay under `extension/src/slo/`, not in React UI components beyond binding results.
- **`elk-monitor-core`** should remain the shared **event contract**; SLO evaluation stays in the extension/app layer until you deliberately promote it.

## Current scope & limitations

- **Demo / prototype quality** — not a production APM product.
- Captures are **capped** in the store (e.g. requests/errors/messages limits); long sessions truncate oldest rows — rates and SLO copy reflect that.
- **AI explanation** (if enabled) may call out to a model; behavior depends on extension config and network — fall back to template copy when unavailable.
- Mock URLs and ports are **hard-coded** in the mock apps; change them consistently if you move ports.
- **Firefox / other browsers**: not the primary target for this extension build.

## License

MIT (unless otherwise noted in sub-packages).
