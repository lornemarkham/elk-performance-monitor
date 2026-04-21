import {
  ELK_MONITOR_CHANNEL,
  ELK_MONITOR_PROTOCOL_VERSION,
  type ElkMonitorEnvelope,
  type ElkMonitorEvent,
} from './types'

const ALLOWED_EVENT_TYPES = new Set<ElkMonitorEvent['eventType']>([
  'app_ready',
  'user_action',
  'post_message_sent',
  'post_message_received',
  'api_request_completed',
  'api_request_failed',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Practical structural check for wire / postMessage payloads.
 * Does not validate every field on each event variant (MVP).
 */
export function isElkMonitorEnvelope(value: unknown): value is ElkMonitorEnvelope {
  if (!isRecord(value)) return false
  if (value.channel !== ELK_MONITOR_CHANNEL) return false
  if (value.v !== ELK_MONITOR_PROTOCOL_VERSION) return false
  const ev = value.event
  if (!isRecord(ev)) return false
  const eventType = ev.eventType
  if (typeof eventType !== 'string') return false
  if (!ALLOWED_EVENT_TYPES.has(eventType as ElkMonitorEvent['eventType'])) return false
  return true
}
