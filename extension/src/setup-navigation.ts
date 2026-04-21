import type { NavigationPayload, PageBridgeEnvelope } from './core/bridge-protocol'
import { ingestPageMessage } from './core/instrumentation-store'

function navigationEventHook(event: NavigationPayload) {
  void event
}

/** Route a validated page-bridge navigation envelope through the hook, then into the store. */
export function handleNavigationEvent(envelope: Extract<PageBridgeEnvelope, { kind: 'navigation' }>): void {
  navigationEventHook(envelope.payload)
  ingestPageMessage(envelope)
}
