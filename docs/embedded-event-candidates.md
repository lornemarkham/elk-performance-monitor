# Embedded Event Candidates

## Purpose

This document proposes a **first-pass event vocabulary** for embedded monitor mode: names and meanings that parent applications, iframes, and micro-frontends can converge on. It is a planning artifact for **future hybrid correlation** with extension mode—not a locked API.

## Principles

- **Clear and honest** — events report what actually happened, not what we wish had happened.
- **Names describe real milestones** — prefer observable phases over vague “performance” labels.
- **Useful across surfaces** — the same ideas should apply when the monitor runs in a parent shell, an iframe, or a nested service UI.
- **Avoid fake certainty** — do not imply precision (exact paint times, guaranteed “first pixel”) without a defined measurement story.

## Candidate Lifecycle Events

| Event | Meaning (first pass) |
|--------|----------------------|
| `monitor_init` | Embedded monitor SDK finished initialization (config applied, subscribers can attach). |
| `app_bootstrap_start` | Application bootstrap began (e.g. root script/module entry, before heavy work). |
| `app_bootstrap_end` | Bootstrap work considered complete enough to serve the app shell or router. |
| `ui_mount` | Primary UI root mounted (framework root render or equivalent). |
| `first_content_visible` | First meaningful content is visible to the user (definition TBD; honest, not synthetic). |
| `ready` | App considers itself ready for interaction (may align with custom app contract). |
| `route_change_start` | Client navigation or route transition began. |
| `route_change_end` | New route’s critical UI/data work for that transition finished (app-defined). |

## Candidate Network/Service Events

| Event | Meaning (first pass) |
|--------|----------------------|
| `api_request_start` | Outbound API call to a backend or service started. |
| `api_request_end` | That call completed (success or failure at HTTP layer). |
| `bff_request_start` | Request to a BFF or aggregation layer started. |
| `bff_request_end` | BFF request completed (success or failure). |

These complement fine-grained request logs; they are **milestone** signals for timelines and correlation, not a full HAR.

## Candidate Error/Problem Events

| Event | Meaning (first pass) |
|--------|----------------------|
| `runtime_error` | Uncaught JS error in the monitored surface. |
| `unhandled_rejection` | Unhandled promise rejection. |
| `render_failure` | Framework or app reported a render error boundary / fatal UI failure. |
| `bootstrap_failure` | Bootstrap aborted or failed before a healthy `ready`/`app_bootstrap_end`. |

## Parent vs Iframe Use

The **same vocabulary** should work whether the emitter is the **parent** app, an **iframe**, or a **microservice-hosted** widget. Later we can add **source identity** (origin, frame id, service name) so hybrid and embedded views can stitch timelines without renaming events per context.

## Not Defined Yet

This document does **not** specify:

- full JSON (or other) **schema**
- **correlation IDs** (trace, span, session)
- exact **payload** fields per event
- **transport** (postMessage, custom DOM events, beacon, SDK callback, etc.)

Those belong in a follow-on protocol or ADR once usage is clearer.

## Why This Matters

**Shared event names** are the contract between “extension sees the page” and “embedded/hybrid sees intentional app semantics.” Aligning on a small, honest vocabulary early reduces rework when parent and iframe surfaces must appear on one timeline.
