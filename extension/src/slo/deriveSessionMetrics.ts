import type { InstrumentationSnapshot } from '../core/instrumentation-store'
import { scanFlowPatterns, type FlowTimelineRow } from './flowPatterns'
import type { SessionMetrics } from './types'

/** Minimum API samples before we report p99.99 (honest about small demos). */
const MIN_SAMPLES_FOR_P9999 = 200

function buildChronoRows(snap: InstrumentationSnapshot): FlowTimelineRow[] {
  const rows: FlowTimelineRow[] = []
  for (const r of snap.requests) {
    rows.push({ kind: 'request', sortKey: r.endTime })
  }
  for (const e of snap.errors) {
    rows.push({ kind: 'error', sortKey: e.timestamp })
  }
  for (const m of snap.interframeMessages) {
    rows.push({ kind: 'message', sortKey: m.timestamp })
  }
  rows.sort((a, b) => a.sortKey - b.sortKey)
  return rows
}

function latencyP9999Ms(durationsMs: number[]): number | null {
  if (durationsMs.length < MIN_SAMPLES_FOR_P9999) return null
  const sorted = [...durationsMs].sort((a, b) => a - b)
  const n = sorted.length
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(0.9999 * n) - 1))
  return sorted[idx]
}

/**
 * Derives session metrics from the extension store snapshot.
 * Caps and list limits from the store affect rates (noted in sampleNotes).
 */
export function deriveSessionMetrics(snap: InstrumentationSnapshot): SessionMetrics {
  const sampleNotes: string[] = []
  const requests = snap.requests
  const totalApiRequests = requests.length
  let successfulApiRequests = 0
  let failedApiRequests = 0
  let count401 = 0
  const apiDurationsMs: number[] = []

  for (const r of requests) {
    if (r.success) successfulApiRequests++
    else failedApiRequests++
    if (r.status === 401) count401++
    if (Number.isFinite(r.durationMs) && r.durationMs >= 0) {
      apiDurationsMs.push(r.durationMs)
    }
  }

  if (snap.requests.length >= 200) {
    sampleNotes.push('Request list is capped at 200; rates and percentiles reflect recent calls only.')
  }

  const chrono = buildChronoRows(snap)
  const { complete: completeFlowCount, failed: failedFlowCount } = scanFlowPatterns(chrono)
  const pageErrorCount = snap.errors.length

  const apiSuccessRatePercent =
    totalApiRequests > 0 ? (100 * successfulApiRequests) / totalApiRequests : null
  const apiErrorRatePercent =
    totalApiRequests > 0 ? (100 * failedApiRequests) / totalApiRequests : null
  const unauthorized401RatePercent =
    totalApiRequests > 0 ? (100 * count401) / totalApiRequests : null

  const flowDenom = completeFlowCount + failedFlowCount + pageErrorCount
  const browserStabilityRatePercent =
    flowDenom > 0 ? (100 * completeFlowCount) / flowDenom : null

  if (flowDenom === 0 && pageErrorCount === 0 && totalApiRequests === 0) {
    sampleNotes.push('No flow or API samples yet; browser SLO cannot be evaluated.')
  } else if (flowDenom === 0) {
    sampleNotes.push(
      'No complete/failed flow chain detected yet; browser rate uses page errors only indirectly—add messaging+API activity.',
    )
  }

  const apiLatencyP9999Ms = latencyP9999Ms(apiDurationsMs)
  if (apiDurationsMs.length > 0 && apiDurationsMs.length < MIN_SAMPLES_FOR_P9999) {
    sampleNotes.push(
      `p99.99 latency needs at least ${MIN_SAMPLES_FOR_P9999} API samples; current sample is ${apiDurationsMs.length}.`,
    )
  }

  return {
    totalApiRequests,
    successfulApiRequests,
    failedApiRequests,
    count401,
    apiDurationsMs,
    pageErrorCount,
    completeFlowCount,
    failedFlowCount,
    apiSuccessRatePercent,
    apiErrorRatePercent,
    unauthorized401RatePercent,
    browserStabilityRatePercent,
    apiLatencyP9999Ms,
    sampleNotes,
  }
}
