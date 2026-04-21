import type { PageBridgeEnvelope } from './core/bridge-protocol'
import { isPageBridgeEnvelope } from './core/bridge-protocol'
import { ingestPageMessage } from './core/instrumentation-store'
import { handleErrorEvent } from './setup-errors'
import { handleNavigationEvent } from './setup-navigation'
import { handleNetworkEvent } from './setup-network'

/** Child content scripts forward page-bridge envelopes to the top frame for unified ingestion. */
const CONTENT_FORWARD_SOURCE = 'elk-perf-monitor-content-forward-v1' as const

export type FrameContext = {
  frameType: 'top' | 'iframe'
  frameUrl: string
}

const handlers = {
  request: handleNetworkEvent,
  error: handleErrorEvent,
  navigation: handleNavigationEvent,
}

function attachFrameContext(envelope: PageBridgeEnvelope, ctx: FrameContext): PageBridgeEnvelope {
  if (envelope.kind === 'request') {
    return {
      ...envelope,
      payload: { ...envelope.payload, frameType: ctx.frameType, frameUrl: ctx.frameUrl },
    }
  }
  if (envelope.kind === 'error') {
    return {
      ...envelope,
      payload: { ...envelope.payload, frameType: ctx.frameType, frameUrl: ctx.frameUrl },
    }
  }
  return {
    ...envelope,
    payload: { ...envelope.payload, frameType: ctx.frameType, frameUrl: ctx.frameUrl },
  }
}

function dispatchEnriched(envelope: PageBridgeEnvelope, ctx: FrameContext): void {
  const enriched = attachFrameContext(envelope, ctx)
  handlers[enriched.kind](enriched as never)
}

function isContentForward(data: unknown): data is {
  source: typeof CONTENT_FORWARD_SOURCE
  frameType: 'iframe'
  frameUrl: string
  bridge: unknown
} {
  if (data == null || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  return (
    o.source === CONTENT_FORWARD_SOURCE &&
    o.frameType === 'iframe' &&
    typeof o.frameUrl === 'string' &&
    'bridge' in o
  )
}

/**
 * Page-world posts `window.postMessage` with `event.source === window`.
 * Top frame: ingest locally. Child frames: forward to `window.top` for the top content script to ingest.
 */
export function setupMessageBridge(): void {
  const localCtx: FrameContext = {
    frameType: window === window.top ? 'top' : 'iframe',
    frameUrl: window.location.href,
  }
  const isTop = window === window.top

  function onBridgeMessage(ev: MessageEvent): void {
    if (ev.source !== window) return
    const data = ev.data
    if (isPageBridgeEnvelope(data)) {
      if (isTop) {
        dispatchEnriched(data, localCtx)
      } else if (window.top) {
        window.top.postMessage(
          {
            source: CONTENT_FORWARD_SOURCE,
            frameType: 'iframe' as const,
            frameUrl: localCtx.frameUrl,
            bridge: data,
          },
          '*',
        )
      }
      return
    }
    if (isTop) {
      ingestPageMessage(data)
    }
  }

  function onForwardedFromChild(ev: MessageEvent): void {
    if (!isTop) return
    if (ev.source === window) return
    if (!isContentForward(ev.data)) return
    if (!isPageBridgeEnvelope(ev.data.bridge)) return
    dispatchEnriched(ev.data.bridge, {
      frameType: 'iframe',
      frameUrl: ev.data.frameUrl,
    })
  }

  window.addEventListener('message', onBridgeMessage)
  if (isTop) {
    window.addEventListener('message', onForwardedFromChild)
  }
}
