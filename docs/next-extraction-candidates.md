# Next Extraction Candidates

## Purpose

This document lists sensible next steps for pulling logic into focused modules—and what to leave alone for now—so refactors stay **intentional**, not cosmetic. Use it when deciding whether a change is worth the churn.

## Good Candidates for Near-Term Extraction

- **Network instrumentation** — When real fetch/XHR (or related) hooks exist, colocate them in `setup-network.ts` so `initMonitor` keeps orchestrating without owning low-level patching details.
- **Error instrumentation** — When real `error` / `unhandledrejection` (or similar) listeners land, keep them in `setup-errors.ts` alongside the same debug and feature gates used at startup.
- **Shared contracts and types** — If embedded, extension, or hybrid modes truly share envelopes, config shapes, or protocol types, promote those to a shared place only when multiple call sites need them; avoid speculative shared folders.

## Things That Should Stay Where They Are For Now

- **Page-world injection** — Stays in `extension/src/content.tsx`. It is extension-runtime and packaging specific; it is not universal monitor bootstrap.
- **React UI mount** — Stays in `extension/src/content.tsx`. The shadow-root panel and DOM lifecycle are tied to this content script entry point.
- **Extension-local core** — Stays under `extension/src/core` for bridge/store logic that belongs to the extension build, until a real multi-package or shared package story exists.
- **Root `src`** — Treat as the broader monitor foundation for now; do not assume every extension concern must move there immediately.

## Why We Are Not Extracting Everything Yet

Premature extraction spreads concepts across files before boundaries are stable, which can **increase** cognitive load. Modules should move when ownership is obvious and the split makes the system easier to change or reuse—not to chase a flat “everything in its own file” layout.

## What Would Trigger a Future Extraction

Consider extracting or relocating code when:

- a single file mixes unrelated responsibilities (bootstrap vs. instrumentation vs. UI),
- the same logic must be used from **multiple modes** or entry points,
- startup order or dependencies become hard to explain without a diagram,
- real usage has clarified who “owns” a concern (extension vs. embedded vs. shared).

## Current Recommendation

- Keep **`content.tsx`** as the extension bootstrap file: injection, boot logging, `initMonitor`, message bridge, then panel mount.
- Keep **`initMonitor`** as the startup coordinator for config-driven feature setup.
- Keep **modularizing only where clarity or reuse clearly wins**; defer moves that only rename or reshuffle without a concrete benefit.
