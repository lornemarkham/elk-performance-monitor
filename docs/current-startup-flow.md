# Current Startup Flow

## Purpose

This document captures the current extension startup architecture so architectural decisions stay clear as the system evolves.

## Current Startup Sequence

When a tab loads a page where the extension’s content script runs, execution proceeds in this order:

1. **`extension/src/content.tsx` loads** — the content script module is evaluated (imports, top-level declarations).
2. **Page-world injection is triggered** — `injectPageWorldScript()` runs so the isolated page context can post messages back to the extension bridge.
3. **Content script boot log runs** — `console.log('[ELK Monitor] booting content script')` confirms the script executed at the top level (not inside React).
4. **`initMonitor(config)` is called** — configuration-driven orchestration starts (extension mode, app name, environment, feature flags, debug).
5. **`initMonitor` conditionally calls delegated setup modules** — for example, when `features.network` or `features.errors` are enabled, it invokes `setupNetworkInstrumentation()` and `setupErrorInstrumentation()` (each may log when `debug` is true).
6. **Message bridge is set up** — `setupMessageBridge()` (in `extension/src/setup-message-bridge.ts`) registers the `window` `message` listener so page-world posts are ingested.
7. **React UI is mounted** — after the bridge is wired, `mount()` runs when the document is ready: if `document.readyState` is still `'loading'`, it waits for `DOMContentLoaded`; otherwise it mounts immediately. The panel is rendered into a shadow root on the page.

High-level dependency flow:

```text
content.tsx
  → injectPageWorldScript()
  → initMonitor(config)
      → setupNetworkInstrumentation()
      → setupErrorInstrumentation()
  → setupMessageBridge()
  → mount React panel
```

---

## Ownership Decision: Page-World Injection

For now, page-world injection remains in `extension/src/content.tsx`.

Reasoning:

- it is specific to the Chrome extension runtime
- it depends on extension packaging and runtime URL behavior
- it is not a universal monitor startup concern across all modes

Because of that, it should not move into `initMonitor()` yet.

`initMonitor()` should remain focused on configuration-driven startup orchestration, not extension-specific bootstrap details.

This may be revisited later if a mode-aware bootstrap layer is introduced, but for now the separation is intentional.


---

## What success looks like
After that, your code and docs will be aligned again.

Then the next real decision is:

> should we extract **UI mount/setup** into its own bootstrap module, or leave mounting in `content.tsx`?

My recommendation is we decide that after the doc update, not before.

Reply with:

**current-startup-flow re-aligned**

Note: navigation events now flow through the bridge and store, but are not yet surfaced in the panel UI.