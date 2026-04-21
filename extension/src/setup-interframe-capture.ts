import { PAGE_BRIDGE_CHANNEL, isPageBridgeEnvelope } from './core/bridge-protocol'
import type { InterframePostMessage } from './core/instrumentation-store'
import { pushInterframeMessage } from './core/instrumentation-store'

const CONTENT_BRIDGE_FORWARD = 'elk-perf-monitor-content-forward-v1' as const
const INTERFRAME_FORWARD = 'elk-perf-monitor-interframe-forward-v1' as const

let msgSeq = 0
function nextMsgId(): string {
  msgSeq += 1
  return `msg-${Date.now().toString(36)}-${msgSeq}`
}

function previewData(data: object): string {
  try {
    const s = JSON.stringify(data)
    if (s.length <= 160) return s
    return `${s.slice(0, 159)}…`
  } catch {
    return '[object]'
  }
}

function isAppTypedMessage(data: unknown): data is Record<string, unknown> & { type: string } {
  if (data == null || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  if (typeof o.type !== 'string') return false
  if (isPageBridgeEnvelope(data)) return false
  if (o.source === CONTENT_BRIDGE_FORWARD) return false
  if (o.source === INTERFRAME_FORWARD) return false
  if (o.channel === PAGE_BRIDGE_CHANNEL) return false
  return true
}

function isInterframeForwardPayload(
  data: unknown,
): data is { source: typeof INTERFRAME_FORWARD; entry: InterframePostMessage } {
  if (data == null || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  if (o.source !== INTERFRAME_FORWARD) return false
  const e = o.entry
  if (e == null || typeof e !== 'object') return false
  const x = e as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    (x.direction === 'parent→iframe' || x.direction === 'iframe→parent') &&
    typeof x.messageType === 'string' &&
    (x.frameType === 'top' || x.frameType === 'iframe') &&
    typeof x.frameUrl === 'string' &&
    typeof x.timestamp === 'number' &&
    typeof x.preview === 'string'
  )
}

function buildEntry(ev: MessageEvent): InterframePostMessage {
  const isTop = window === window.top
  const direction: InterframePostMessage['direction'] = isTop ? 'iframe→parent' : 'parent→iframe'
  return {
    id: nextMsgId(),
    direction,
    messageType: (ev.data as { type: string }).type,
    frameType: isTop ? 'top' : 'iframe',
    frameUrl: window.location.href,
    timestamp: Date.now(),
    preview: previewData(ev.data as object),
  }
}

/**
 * Captures cross-frame postMessage traffic (payload has string `type`, not extension bridge).
 * Top frame ingests; child frames forward entries to top (unified panel store).
 */
export function setupInterframeCapture(): void {
  const isTop = window === window.top

  function onAppMessage(ev: MessageEvent): void {
    if (ev.source === window) return
    if (!isAppTypedMessage(ev.data)) return
    const entry = buildEntry(ev)
    if (isTop) {
      pushInterframeMessage(entry)
    } else if (window.top) {
      window.top.postMessage(
        {
          source: INTERFRAME_FORWARD,
          entry,
        },
        '*',
      )
    }
  }

  function onForwardedEntry(ev: MessageEvent): void {
    if (!isTop) return
    if (ev.source === window) return
    if (!isInterframeForwardPayload(ev.data)) return
    pushInterframeMessage(ev.data.entry)
  }

  window.addEventListener('message', onAppMessage)
  if (isTop) {
    window.addEventListener('message', onForwardedEntry)
  }
}
