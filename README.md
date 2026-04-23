# ELK Performance Monitor

A Chrome extension that instruments **any** web app you visit — capturing network calls, errors, user interactions, iframe postMessage traffic, and workflow journeys (Submit Referral, ambient polling, etc.) and rendering them in a docked panel.

Use it against **local, dev, QA, or prod** environments. A small mock stack is bundled for offline demos, but it is not required.

---

## Quick Start (under 10 minutes)

### 1. Prerequisites

- **Node.js 20+** (LTS recommended)
- **Google Chrome** (or any Chromium browser)

### 2. Install and build the extension

```bash
git clone <this-repo-url>
cd elk-performance-monitor/extension
npm install
npm run build
```

This produces a loadable extension at `extension/dist/`.

### 3. Load the extension in Chrome

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `extension/dist` folder from this repo.

The extension is now installed. Keep the `extension/dist` path stable — subsequent `npm run build` runs overwrite this folder in place, so you just hit **Reload** on the extension card after rebuilding.

### 4. Use it on a real app

1. Open the target web app (e.g. `https://your-app.dev`, `http://localhost:3000`, etc.).
2. Click the ELK Performance Monitor icon (or expand the docked panel, depending on your build).
3. Interact with the app normally — the panel shows live captures.

That's it. No server setup, no config file.

---

## What you get

- **Journey** — user-driven workflow view (clicks, submits, request hierarchy, Submit Referral grouping)
- **Ambient** — repeated background polling detected automatically, summarized by normalized route
- **Network / Errors / Messages** — raw telemetry, filterable
- **Session health** — KPIs (success rate, error count, server calls, user wait time)

---

## Rebuilding after code changes

From `extension/`:

```bash
npm run build    # full build: type-check + vite content + vite page-world
npm run watch    # rebuilds on file changes (reload the extension card in Chrome after each build)
```

Or from the repo root:

```bash
npm run build:extension
```

After any rebuild: go to `chrome://extensions` → click the **Reload** icon on ELK Performance Monitor → refresh your target tab.

---

## Repo layout

| Path | Role |
|------|------|
| `extension/` | The Chrome extension (MV3). This is the main deliverable. |
| `packages/elk-monitor-core/` | Shared event/contract types used by the extension. |
| `mock-api/`, `mock-parent/`, `mock-eleos-iframe/` | **Optional** local demo stack (see below). |
| `docs/` | Design notes and roadmap. |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Extension doesn't appear after Load unpacked | Make sure you selected `extension/dist`, not `extension/` or `extension/src`. |
| Panel is empty on the target page | Reload the tab after enabling the extension. The content script attaches on load. |
| Build fails on `tsc --noEmit` | Ensure Node 20+ and re-run `npm install` inside `extension/`. |
| Changes don't appear in the browser | Rebuild (`npm run build`), then click **Reload** on the extension card, then refresh the target tab. |

---

## Contributing

Keep it simple:

1. Create a branch.
2. Make your change (extension code lives in `extension/src/`).
3. `cd extension && npm run build` to confirm it compiles.
4. Manually verify in Chrome (load unpacked + refresh target tab).
5. Open a PR.

No mandatory lint/test gate right now — this is a focused internal tool. Don't over-engineer contributions.

---

## Optional: Local demo stack (Demo Only)

> **You do not need this for normal use.** The demo stack only exists for offline presentations, QA of the extension itself, or developing against a predictable fixture. Skip this section unless you specifically need it.

The stack consists of three small services:

- `mock-api/` — Express API on port **4010**
- `mock-parent/` — Vite host app on port **5173**
- `mock-eleos-iframe/` — Vite iframe on port **5174**

### One-time install

```bash
cd mock-api && npm install && cd ..
cd mock-parent && npm install && cd ..
cd mock-eleos-iframe && npm install && cd ..
```

### Run (three terminals)

```bash
# terminal 1
npm run demo:api          # Express mock API on :4010

# terminal 2
npm run demo:iframe       # Vite iframe on :5174

# terminal 3
npm run demo:parent       # Vite parent host on :5173
```

Then open `http://localhost:5173` and use the extension panel as usual.

Ports are currently hard-coded in the mock apps; change them consistently if you need to move them.

---

## Scope & limitations

- **Internal tool quality** — not a production APM product.
- Captures are **capped** in the in-memory store; long sessions truncate oldest rows.
- **Firefox / non-Chromium browsers** are not a target for this build.
- Some UI elements (narrative copy, SLO rows) depend on the audience toggle in the header.

---

## License

MIT (unless otherwise noted in sub-packages).

