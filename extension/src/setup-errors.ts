import type { PageBridgeEnvelope } from './core/bridge-protocol'
import { ingestPageMessage } from './core/instrumentation-store'

function errorEventHook(event: {
  type: 'runtime-error' | 'unhandled-rejection'
  message: string
  stack?: string
  timestamp: number
}) {
  // forward to existing instrumentation logic later
  void event
}

/** Route a validated page-bridge error envelope through the error hook, then into the store. */
export function handleErrorEvent(envelope: Extract<PageBridgeEnvelope, { kind: 'error' }>): void {
  const p = envelope.payload
  errorEventHook({
    type: p.type,
    message: p.message,
    stack: p.stack ?? undefined,
    timestamp: p.timestamp,
  })
  ingestPageMessage(envelope)
}

export function setupErrorInstrumentation(debug?: boolean) {
  if (debug) {
    console.log('[ELK Monitor] error instrumentation initialized')
  }
}
