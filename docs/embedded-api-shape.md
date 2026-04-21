# Embedded Monitor API Shape

## Purpose

This document sketches the **developer-facing API** for embedded mode: how a host application (parent or iframe) initializes the monitor and **emits** lifecycle and performance-related events. It is a design target, not a guarantee of current package names or exports.

## Design Goals

- **Simple to use** — a small surface area (`init`, `emit`, and a few helpers later).
- **Minimal setup** — one init call with stable identifiers (app, surface, environment).
- **Consistent across parent and iframe** — same module and calls whether code runs in the shell or a nested frame.
- **Framework-agnostic** — no dependency on React, Vue, Svelte, etc.; wrappers can be added separately.
- **Manual and automatic** — supports explicit `emit` calls and future auto-instrumentation (e.g. fetch) behind the same config.

## Basic Usage

Illustrative example (import path and package name are placeholders):

```ts
import { monitor } from 'elk-monitor'

monitor.init({
  appName: 'pro',
  surface: 'parent',
  environment: 'prod',
})

monitor.emit('ui_mount')
monitor.emit('ready')
```

`init` establishes identity and environment for correlation; `emit` forwards named events (see `embedded-event-candidates.md` for candidate names). Payloads, batching, and transport are intentionally unspecified here and will follow a separate protocol note.
