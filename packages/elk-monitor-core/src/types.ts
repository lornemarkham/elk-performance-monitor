export const ELK_MONITOR_PROTOCOL_VERSION = 1 as const

export const ELK_MONITOR_CHANNEL = 'elk-monitor-app-v1' as const

export type SourceApp = 'parent' | 'iframe'

export type SessionContext = {
  sessionId: string
  flowId?: string
}

export type BaseFields = SessionContext & {
  timestamp: number
  sourceApp: SourceApp
  surface?: string
  metadata?: Record<string, string | number | boolean | null>
}

export type AppReadyEvent = BaseFields & {
  eventType: 'app_ready'
  phase: 'loaded' | 'hydrated' | 'eleos_iframe_ready'
}

export type UserActionEvent = BaseFields & {
  eventType: 'user_action'
  action: string
}

export type PostMessageSentEvent = BaseFields & {
  eventType: 'post_message_sent'
  messageType: string
  targetOrigin?: string
  payloadPreview?: string
}

export type PostMessageReceivedEvent = BaseFields & {
  eventType: 'post_message_received'
  messageType: string
  origin?: string
  payloadPreview?: string
}

export type ApiRequestCompletedEvent = BaseFields & {
  eventType: 'api_request_completed'
  requestId: string
  method: string
  url: string
  status: number
  durationMs?: number
  outcome: 'success'
}

export type ApiRequestFailedEvent = BaseFields & {
  eventType: 'api_request_failed'
  requestId: string
  method: string
  url: string
  status?: number
  outcome: 'network_error' | 'http_error' | 'aborted'
  errorMessage?: string
}

export type ElkMonitorEvent =
  | AppReadyEvent
  | UserActionEvent
  | PostMessageSentEvent
  | PostMessageReceivedEvent
  | ApiRequestCompletedEvent
  | ApiRequestFailedEvent

export type ElkMonitorEnvelope<T extends ElkMonitorEvent = ElkMonitorEvent> = {
  channel: typeof ELK_MONITOR_CHANNEL
  v: typeof ELK_MONITOR_PROTOCOL_VERSION
  event: T
}
