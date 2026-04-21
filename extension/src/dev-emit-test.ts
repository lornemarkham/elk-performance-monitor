/**
 * Dev helper: simulate production-shaped page bridge messages.
 * Not wired into production; use from the console or a temporary import while testing.
 */
import {
  PAGE_BRIDGE_CHANNEL,
  PROTOCOL_VERSION,
  type PageBridgeEnvelope,
} from './core/bridge-protocol'

let devSeq = 0
function devId(prefix: string): string {
  devSeq += 1
  return `${prefix}-dev-${Date.now().toString(36)}-${devSeq}`
}

export function simulateEmbeddedEvents() {
  const emit = (envelope: PageBridgeEnvelope) => {
    window.postMessage(envelope, '*')
  }

  const startTime = Date.now() - 120
  const endTime = Date.now()

  emit({
    channel: PAGE_BRIDGE_CHANNEL,
    v: PROTOCOL_VERSION,
    kind: 'request',
    payload: {
      id: devId('fetch'),
      source: 'fetch',
      method: 'GET',
      url: new URL('/users', window.location.href).href,
      startTime,
      endTime,
      durationMs: Math.max(0, Math.round(endTime - startTime)),
      status: 200,
      success: true,
      requestKind: 'unknown',
      error: null,
    },
  })

  emit({
    channel: PAGE_BRIDGE_CHANNEL,
    v: PROTOCOL_VERSION,
    kind: 'error',
    payload: {
      id: devId('err'),
      type: 'runtime-error',
      message: 'Test error',
      stack: null,
      timestamp: Date.now(),
    },
  })
}
