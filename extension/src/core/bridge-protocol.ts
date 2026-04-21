/** Keep in sync across `page-world.ts` (page context) and content script handlers. */
export const PAGE_BRIDGE_CHANNEL = 'elk-perf-monitor-page-v1' as const
export const PROTOCOL_VERSION = 2 as const

export type RequestKind = 'api-bff' | 'frontend' | 'external' | 'unknown'

/** Performance Navigation Timing summary (content script or page-world). */
export type FrameContextFields = {
  frameType?: 'top' | 'iframe'
  frameUrl?: string
}

export type NavigationPayload = {
  type: 'navigation'
  startTime: number
  domContentLoaded: number
  loadEventEnd: number
  responseStart: number
  responseEnd: number
} & FrameContextFields

export type PageBridgeEnvelope =
  | {
      channel: typeof PAGE_BRIDGE_CHANNEL
      v: typeof PROTOCOL_VERSION
      kind: 'request'
      payload: RequestPayload
    }
  | {
      channel: typeof PAGE_BRIDGE_CHANNEL
      v: typeof PROTOCOL_VERSION
      kind: 'error'
      payload: ErrorPayload
    }
  | {
      channel: typeof PAGE_BRIDGE_CHANNEL
      v: typeof PROTOCOL_VERSION
      kind: 'navigation'
      payload: NavigationPayload
    }

export type RequestPayload = {
  id: string
  source: 'fetch' | 'xhr'
  method: string
  url: string
  /** Wall-clock ms when the call started (`Date.now()`). */
  startTime: number
  /** Wall-clock ms when the call finished (`Date.now()`). */
  endTime: number
  durationMs: number
  status: number | null
  success: boolean
  requestKind: RequestKind
  error: string | null
} & FrameContextFields

export type ErrorPayload = {
  id: string
  type: 'runtime-error' | 'unhandled-rejection'
  message: string
  stack: string | null
  /** Wall-clock ms (`Date.now()`). */
  timestamp: number
} & FrameContextFields

export function isPageBridgeEnvelope(data: unknown): data is PageBridgeEnvelope {
  if (data == null || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  if (o.channel !== PAGE_BRIDGE_CHANNEL || o.v !== PROTOCOL_VERSION) return false
  if (o.kind !== 'request' && o.kind !== 'error' && o.kind !== 'navigation') return false
  const p = o.payload
  if (p == null || typeof p !== 'object') return false
  return true
}
