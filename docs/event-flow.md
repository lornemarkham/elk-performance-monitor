# Event Flow

## Purpose

This document captures how **request** and **error** events move through the extension from capture in the page to the panel UI, so the pipeline is easy to explain and extend. (Errors use the same bridge and store as requests but are routed through `handleErrorEvent` instead of `handleNetworkEvent`; see the request path below for the shared tail of the pipeline.)

## Request Event Flow

Today, a completed fetch/XHR (or equivalent) is tracked like this:

1. **Page-world captures a request event** — instrumentation in the page context records timing, URL, method, status, etc., and builds a typed bridge payload.
2. **It posts the event to the window bridge** — `window.postMessage` carries a versioned envelope the content script recognizes.
3. **`setup-message-bridge.ts` receives the message** — the content script listener runs only for same-window posts (`event.source === window`).
4. **Validated request messages are routed to `handleNetworkEvent(...)`** — after `isPageBridgeEnvelope` and `kind === 'request'`, the envelope is passed to `extension/src/setup-network.ts`.
5. **`handleNetworkEvent(...)` performs any network-specific handling** — today this includes a small internal summary hook; it is the place to add network-only logic without bloating the bridge.
6. **The unchanged envelope is forwarded to `ingestPageMessage(...)`** — the full envelope (including the complete `RequestPayload`) is ingested so nothing is lost at the boundary.
7. **The instrumentation store updates** — capped lists and counters in `instrumentation-store` advance and subscribers are notified.
8. **The UI re-renders from the store** — React hooks (e.g. `useInstrumentation`) read the latest snapshot and the panel reflects new rows.

```text
page-world
  → setup-message-bridge
      → handleNetworkEvent
          → ingestPageMessage
              → store
                  → UI
```
