import { useSyncExternalStore } from 'react'
import type { ErrorPayload, NavigationPayload, RequestPayload } from './bridge-protocol'
import { isPageBridgeEnvelope } from './bridge-protocol'

const MAX_REQUESTS = 200
const MAX_ERRORS = 100
const MAX_NAVIGATIONS = 20
const MAX_INTERFRAME_MESSAGES = 100

/** Cross-frame window.postMessage observed in content script (app payloads with string `type`). */
export type InterframePostMessage = {
  id: string
  direction: 'parent→iframe' | 'iframe→parent'
  messageType: string
  frameType: 'top' | 'iframe'
  frameUrl: string
  timestamp: number
  preview: string
}

export type InstrumentationSnapshot = {
  /** When true, bridge events are ignored (lists and counts do not change). */
  recordingPaused: boolean
  /** Lifetime count of captured fetch + XHR completions (parent page only). */
  totalCalls: number
  /** Subset of totalCalls where the request is marked not OK (HTTP error, network error, etc.). */
  failedCalls: number
  /** Lifetime count of runtime errors + unhandled rejections. */
  totalPageErrors: number
  /** Newest-first capped list for the request log. */
  requests: RequestPayload[]
  /** Newest-first capped list for the error log. */
  errors: ErrorPayload[]
  /** Newest-first capped list of navigation timing snapshots. */
  navigations: NavigationPayload[]
  /** Parent ↔ iframe postMessage captures (top-frame store only). */
  interframeMessages: InterframePostMessage[]
}

let requests: RequestPayload[] = []
let errors: ErrorPayload[] = []
let navigations: NavigationPayload[] = []
let interframeMessages: InterframePostMessage[] = []
let totalCalls = 0
let failedCalls = 0
let totalPageErrors = 0
let recordingPaused = false

const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function pushRequest(p: RequestPayload): void {
  totalCalls += 1
  if (!p.success) failedCalls += 1
  requests = [p, ...requests].slice(0, MAX_REQUESTS)
  emit()
}

function pushError(p: ErrorPayload): void {
  totalPageErrors += 1
  errors = [p, ...errors].slice(0, MAX_ERRORS)
  emit()
}

function pushNavigation(p: NavigationPayload): void {
  navigations = [p, ...navigations].slice(0, MAX_NAVIGATIONS)
  emit()
}

/** Top-frame store only (child frames forward via postMessage). */
export function pushInterframeMessage(entry: InterframePostMessage): void {
  if (recordingPaused) return
  interframeMessages = [entry, ...interframeMessages].slice(0, MAX_INTERFRAME_MESSAGES)
  emit()
}

export function ingestPageMessage(data: unknown): void {
  if (recordingPaused) return
  if (!isPageBridgeEnvelope(data)) return
  if (data.kind === 'request') pushRequest(data.payload)
  else if (data.kind === 'error') pushError(data.payload)
  else pushNavigation(data.payload)
}

/** Pause or resume capture from the page bridge (no new rows while paused). */
export function setRecordingPaused(paused: boolean): void {
  if (recordingPaused === paused) return
  recordingPaused = paused
  emit()
}

/** Clear lists and zero counters for a fresh session (extension-only; does not affect the host page). */
export function resetInstrumentation(): void {
  if (
    totalCalls === 0 &&
    failedCalls === 0 &&
    totalPageErrors === 0 &&
    requests.length === 0 &&
    errors.length === 0 &&
    navigations.length === 0 &&
    interframeMessages.length === 0
  ) {
    return
  }
  requests = []
  errors = []
  navigations = []
  interframeMessages = []
  totalCalls = 0
  failedCalls = 0
  totalPageErrors = 0
  emit()
}

/**
 * useSyncExternalStore compares snapshots with Object.is. A new object literal every call
 * always looks "changed", so React re-renders forever (max update depth). Reuse one object
 * until module state actually changes (emit already runs after mutations).
 */
let snapshotCache: InstrumentationSnapshot | null = null

function getSnapshot(): InstrumentationSnapshot {
  if (
    snapshotCache !== null &&
    snapshotCache.recordingPaused === recordingPaused &&
    snapshotCache.totalCalls === totalCalls &&
    snapshotCache.failedCalls === failedCalls &&
    snapshotCache.totalPageErrors === totalPageErrors &&
    snapshotCache.requests === requests &&
    snapshotCache.errors === errors &&
    snapshotCache.navigations === navigations &&
    snapshotCache.interframeMessages === interframeMessages
  ) {
    return snapshotCache
  }
  snapshotCache = {
    recordingPaused,
    totalCalls,
    failedCalls,
    totalPageErrors,
    requests,
    errors,
    navigations,
    interframeMessages,
  }
  return snapshotCache
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useInstrumentation(): InstrumentationSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
