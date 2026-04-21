# Embedded Integration Shape

## Purpose

Define how a host application installs and interacts with the performance monitor in embedded mode.

This is the first real product-facing interface.

---

## Core Concept

An application installs the monitor by calling a single initialization function.

Example:

```ts
initMonitor({
  mode: 'embedded',
  appName: 'my-app',
  environment: 'local'
})
```

---

## Initialization API

### `initMonitor(config)`

#### Config shape

```ts
type MonitorConfig = {
  mode: 'embedded' | 'extension' | 'hybrid'

  appName: string
  environment?: 'local' | 'dev' | 'staging' | 'prod'

  features?: {
    network?: boolean
    errors?: boolean
    slo?: boolean
    dom?: boolean
  }

  debug?: boolean
}
```
