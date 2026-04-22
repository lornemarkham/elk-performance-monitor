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
  /** Time to first paint (if available) */
  firstPaint?: number
  /** Time to first contentful paint (if available) */
  firstContentfulPaint?: number
  /** Time when iframe became interactive (if applicable) */
  timeToInteractive?: number
} & FrameContextFields

export type UserInteractionPayload = {
  type: 'interaction'
  id: string
  interactionType: 'click' | 'submit' | 'input' | 'scroll' | 'focus'
  /** Element selector or description */
  target: string
  /** Element text content (truncated) */
  targetText?: string
  /** Timestamp of interaction */
  timestamp: number
  /** Additional context (e.g., form field name, button label) */
  context?: Record<string, unknown>
} & FrameContextFields

export type MilestonePayload = {
  type: 'milestone'
  id: string
  /** Milestone name (e.g., 'page_loaded', 'iframe_ready', 'form_submitted') */
  name: string
  /** Human-readable description */
  description: string
  /** Timestamp when milestone was reached */
  timestamp: number
  /** Duration from session start or previous milestone */
  durationFromStart?: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
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
  | {
      channel: typeof PAGE_BRIDGE_CHANNEL
      v: typeof PROTOCOL_VERSION
      kind: 'interaction'
      payload: UserInteractionPayload
    }
  | {
      channel: typeof PAGE_BRIDGE_CHANNEL
      v: typeof PROTOCOL_VERSION
      kind: 'milestone'
      payload: MilestonePayload
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
  if (
    o.kind !== 'request' &&
    o.kind !== 'error' &&
    o.kind !== 'navigation' &&
    o.kind !== 'interaction' &&
    o.kind !== 'milestone'
  )
    return false
  const p = o.payload
  if (p == null || typeof p !== 'object') return false
  return true
}
