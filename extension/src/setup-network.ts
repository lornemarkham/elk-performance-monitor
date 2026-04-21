import type { PageBridgeEnvelope } from './core/bridge-protocol'
import { ingestPageMessage } from './core/instrumentation-store'

function networkEventHook(event: {
  url: string
  method: string
  status: number
  duration: number
}) {
  // forward to existing instrumentation logic (do not change behavior)
  void event
}

/** Route a validated page-bridge request envelope through the network hook, then into the store. */
export function handleNetworkEvent(envelope: Extract<PageBridgeEnvelope, { kind: 'request' }>): void {
  const p = envelope.payload
  networkEventHook({
    url: p.url,
    method: p.method,
    status: p.status ?? 0,
    duration: p.durationMs,
  })
  ingestPageMessage(envelope)
}

export function setupNetworkInstrumentation(debug?: boolean) {
  if (debug) {
    console.log('[ELK Monitor] network instrumentation initialized')
  }
}
