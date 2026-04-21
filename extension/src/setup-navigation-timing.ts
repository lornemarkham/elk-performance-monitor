import { PAGE_BRIDGE_CHANNEL, PROTOCOL_VERSION } from './core/bridge-protocol'

export function setupNavigationTiming(debug?: boolean) {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined

  if (!nav) return

  const payload = {
    type: 'navigation' as const,
    startTime: nav.startTime,
    domContentLoaded: nav.domContentLoadedEventEnd,
    loadEventEnd: nav.loadEventEnd,
    responseStart: nav.responseStart,
    responseEnd: nav.responseEnd,
  }

  if (debug) {
    console.log('[ELK Monitor] navigation timing', {
      startTime: payload.startTime,
      domContentLoaded: payload.domContentLoaded,
      loadEventEnd: payload.loadEventEnd,
      responseStart: payload.responseStart,
      responseEnd: payload.responseEnd,
    })
  }

  window.postMessage(
    {
      channel: PAGE_BRIDGE_CHANNEL,
      v: PROTOCOL_VERSION,
      kind: 'navigation',
      payload,
    },
    '*',
  )
}
