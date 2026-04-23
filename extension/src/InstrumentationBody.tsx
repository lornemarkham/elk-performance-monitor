import type { ErrorPayload, RequestKind, RequestPayload } from './core/bridge-protocol'
import {
  resetInstrumentation,
  setRecordingPaused,
  useInstrumentation,
} from './core/instrumentation-store'
import { generateAIExplanation, type SessionSignals } from './lib/aiExplain'
import { computeSessionHealth } from './lib/sessionHealth'
import { PanelStickyBar, type CombinedHealthUi } from './PanelStickyBar'
import { SloTabPanel } from './SloTabPanel'
import { JourneyTab } from './JourneyTab'
import { ELEOS_DEFAULT_SLOS } from './slo/eleosDefaultSlos'
import { deriveSessionMetrics } from './slo/deriveSessionMetrics'
import { evaluateSlos } from './slo/evaluateSlos'
import type { SloAudience, SloEvaluationOutcome, SloOverallStatus } from './slo/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function statusLabel(status: number | null, success: boolean): string {
  if (status == null) return success ? '—' : 'ERR'
  return String(status)
}

function frameLabel(frameType: string | undefined, frameUrl: string | undefined): string | null {
  if (frameType !== 'top' && frameType !== 'iframe') return null
  const u = frameUrl ? shorten(frameUrl, 48) : ''
  return `${frameType}${u ? ` · ${u}` : ''}`
}

function kindLabel(k: RequestKind): string {
  switch (k) {
    case 'api-bff':
      return 'API/BFF'
    case 'frontend':
      return 'Frontend'
    case 'external':
      return 'External'
    default:
      return 'Unknown'
  }
}

function formatClock(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(ms)
  }
}

/** Break visual clusters when consecutive events (newest-first) are farther apart than this. */
const TIMELINE_GROUP_GAP_MS = 1800

/** Highlight message↔request pairs when their timestamps are within this gap (story flow). */
const TIMELINE_FLOW_PAIR_MS = 500

function urlPathForTimeline(url: string): string {
  try {
    const u = new URL(url, 'http://timeline.local')
    const path = u.pathname + (u.search || '')
    return path.length > 0 ? path : '/'
  } catch {
    return shorten(url, 42)
  }
}

function frameWordForStory(frameType: string | undefined): string {
  if (frameType === 'iframe') return 'iframe'
  if (frameType === 'top') return 'top'
  return 'page'
}

function normalizePostMessageDirection(raw: string): string {
  if (raw === 'parent→iframe') return 'parent → iframe'
  if (raw === 'iframe→parent') return 'iframe → parent'
  return raw
    .replace(/→/g, ' → ')
    .replace(/->/g, ' → ')
    .replace(/\s+/g, ' ')
    .trim()
}

function requestStorySummary(r: RequestPayload): string {
  const frame = frameWordForStory(r.frameType)
  const path = urlPathForTimeline(r.url)
  return `${frame} · ${r.method} ${path} · ${statusLabel(r.status, r.success)}`
}

function errorStorySummary(e: ErrorPayload): string {
  const frame = frameWordForStory(e.frameType)
  const m = e.message.trim()
  const statusMatch = m.match(/\b(40[0-9]|41[0-9]|42[0-9]|43[0-9]|44[0-9]|45[0-9]|50[0-9])\b/)
  if (statusMatch) {
    const code = statusMatch[1]
    const rest = m.replace(statusMatch[0], '').replace(/^[:\s.,-]+/, '').trim()
    const detail = (rest.length > 0 ? shorten(rest, 40) : 'error').toLowerCase()
    return `${frame} · ${code} ${detail}`
  }
  return `${frame} · ${shorten(m, 56)}`
}

type PanelTab = 'journey' | 'overview' | 'slos' | 'timeline'

type TimelineDetailTab = 'story' | 'requests' | 'errors' | 'messages'

type RequestFilter = 'all' | 'failed' | RequestKind

type TimelineRow = {
  kind: 'request' | 'error' | 'message'
  sortKey: number
  rowKey: string
  frameType?: 'top' | 'iframe'
  frameUrl?: string
  summary: string
  preview: string
}

function pairMessageRequest(a: TimelineRow['kind'], b: TimelineRow['kind']): boolean {
  return (a === 'message' && b === 'request') || (a === 'request' && b === 'message')
}

/** Oldest → newest. Same gap rule as timeline clusters. */
function countTimelineClusters(chrono: TimelineRow[]): number {
  if (chrono.length === 0) return 0
  let n = 1
  for (let i = 1; i < chrono.length; i++) {
    if (chrono[i].sortKey - chrono[i - 1].sortKey > TIMELINE_GROUP_GAP_MS) n++
  }
  return n
}

/**
 * Greedy scan: message → request → message = complete; message → request → error = failed.
 * Skips overlapping matches by advancing past the end of each match.
 */
function scanFlowPatterns(chrono: TimelineRow[]): { complete: number; failed: number } {
  let complete = 0
  let failed = 0
  let i = 0
  while (i < chrono.length) {
    if (chrono[i].kind !== 'message') {
      i++
      continue
    }
    let j = i + 1
    while (j < chrono.length && chrono[j].kind !== 'request') j++
    if (j >= chrono.length) {
      i++
      continue
    }
    let k = j + 1
    while (
      k < chrono.length &&
      chrono[k].kind !== 'message' &&
      chrono[k].kind !== 'error'
    ) {
      k++
    }
    if (k >= chrono.length) {
      i++
      continue
    }
    if (chrono[k].kind === 'message') complete++
    else failed++
    i = k + 1
  }
  return { complete, failed }
}

function pathLooksLikeEvaluate(url: string): boolean {
  return urlPathForTimeline(url).includes('/api/evaluate')
}

type ExplainPersona = 'default' | 'sales' | 'engineer' | 'product'

/** Shared inputs for Default + persona-specific explain text (template-only). */
type SessionExplainMetrics = {
  clusterCount: number
  apiCalls: number
  messageCount: number
  pageErrors: number
  complete: number
  failed: number
  successfulEval: number
  failed401: number
  failedOther: number
  anyFailedRequest: boolean
  hadPatientContext: boolean
  hadCandidateResult: boolean
  /** postMessage `type` values in chronological order (deduped). */
  distinctMessageTypes: string[]
  /** First captured request whose path looks like an evaluate call (for engineer line). */
  evalRequest: RequestPayload | null
}

/** 2–4 short sentences — Default persona (“Explain session”). */
function buildSessionExplanation(p: SessionExplainMetrics): string {
  const s: string[] = []
  const interactionPhrase =
    p.clusterCount === 1 ? 'one interaction' : `${p.clusterCount} interactions`
  s.push(`A user triggered ${interactionPhrase} with the system.`)

  if (p.messageCount > 0 && p.apiCalls > 0) {
    if (p.hadPatientContext) {
      s.push(
        'The parent application sent patient data to the iframe, which then made an API request and returned a result.',
      )
    } else {
      s.push(
        'The parent and iframe exchanged postMessage traffic; the iframe then called backend APIs and replied.',
      )
    }
  } else if (p.messageCount > 0) {
    s.push('Cross-frame messages were recorded with little or no API traffic in this capture.')
  } else if (p.apiCalls > 0) {
    s.push('The page made API requests without recorded parent–iframe messages.')
  }

  if (!p.anyFailedRequest && p.pageErrors === 0) {
    if (p.successfulEval > 0 || p.complete > 0) {
      s.push('The request completed successfully with no errors.')
    } else {
      s.push('No failed requests or page errors were recorded.')
    }
  } else {
    const parts: string[] = []
    if (p.failed401 > 0) {
      parts.push(
        p.failed401 === 1
          ? 'a 401 unauthorized response'
          : `${p.failed401} unauthorized (401) responses`,
      )
    }
    if (p.failedOther > 0) {
      parts.push(
        p.failedOther === 1
          ? 'another API failure'
          : `${p.failedOther} failed API responses`,
      )
    }
    if (p.pageErrors > 0) {
      parts.push(
        p.pageErrors === 1 ? 'a runtime/page error' : `${p.pageErrors} runtime errors`,
      )
    }
    if (p.failed > 0) {
      parts.push(
        p.failed === 1
          ? 'one flow failed after messaging and an API call'
          : `${p.failed} flows failed after messaging and API activity`,
      )
    }
    s.push(
      parts.length > 0
        ? `Issues included: ${parts.join('; ')}.`
        : 'Something went wrong in this session (see Timeline and Errors).',
    )
  }

  return s.slice(0, 4).join(' ')
}

function buildSalesExplanation(m: SessionExplainMetrics): string {
  if (!m.anyFailedRequest && m.pageErrors === 0) {
    if (m.successfulEval > 0 || m.complete > 0) {
      return m.successfulEval > 1 || m.complete > 1
        ? 'The system successfully processed evaluations in this session with no blocking issues.'
        : 'The system successfully processed a patient evaluation with no issues.'
    }
    if (m.apiCalls === 0 && m.messageCount === 0) {
      return 'No API or messaging activity to report yet.'
    }
    return 'This session completed without failed calls or page errors.'
  }
  if (m.failed401 > 0 && m.failedOther === 0 && m.pageErrors === 0) {
    return 'Authorization blocked part of the workflow (401), so the evaluation outcome was not successful.'
  }
  if (m.failedOther > 0 || m.failed401 > 0) {
    return 'Some API responses failed, so the session did not achieve a clean success outcome.'
  }
  return 'Errors occurred during the session; the user-facing outcome was not fully successful.'
}

function buildEngineerExplanation(m: SessionExplainMetrics): string {
  const parts: string[] = []
  if (m.hadPatientContext) {
    parts.push('Parent sent patient_context')
  } else if (m.distinctMessageTypes.length > 0) {
    parts.push(`postMessage types: ${m.distinctMessageTypes.join(' → ')}`)
  }

  if (m.evalRequest) {
    const path = urlPathForTimeline(m.evalRequest.url)
    const st = statusLabel(m.evalRequest.status, m.evalRequest.success)
    parts.push(`iframe made ${m.evalRequest.method} ${path} (${st})`)
  } else if (m.apiCalls > 0) {
    parts.push(`${m.apiCalls} API call(s)`)
  }

  if (m.hadCandidateResult) {
    parts.push('then returned candidate_result')
  } else if (m.complete > 0 && m.messageCount > 0) {
    parts.push('iframe replied via postMessage')
  }

  let body = parts.length > 0 ? `${parts.join(', ')}.` : 'No API or postMessage detail captured.'

  if (m.anyFailedRequest || m.pageErrors > 0) {
    const issues: string[] = []
    if (m.failed401 > 0) issues.push('401')
    if (m.failedOther > 0) issues.push('API failure')
    if (m.pageErrors > 0) issues.push('runtime error')
    body += ` Issues: ${issues.join(', ')}.`
  }

  return body
}

function buildProductExplanation(m: SessionExplainMetrics): string {
  if (!m.anyFailedRequest && m.pageErrors === 0) {
    if (m.complete > 0) {
      return 'User completed a full evaluation flow without friction or errors.'
    }
    if (m.successfulEval > 0 || (m.messageCount > 0 && m.apiCalls > 0)) {
      return m.clusterCount > 1
        ? 'The user moved through multiple bursts of activity; the captured path looks smooth with no recorded errors.'
        : 'User completed the embedded flow: messaging plus backend work, with no recorded errors.'
    }
    return 'No friction detected in this capture (no failures logged).'
  }
  if (m.failed401 > 0) {
    return 'The user journey was blocked by authorization, so they did not get a successful evaluation outcome.'
  }
  return 'The user hit errors or failed requests along the way, so the journey did not finish cleanly.'
}

function explainForPersona(m: SessionExplainMetrics, persona: ExplainPersona): string {
  switch (persona) {
    case 'sales':
      return buildSalesExplanation(m)
    case 'engineer':
      return buildEngineerExplanation(m)
    case 'product':
      return buildProductExplanation(m)
    default:
      return buildSessionExplanation(m)
  }
}

function explainForSloAudience(m: SessionExplainMetrics, audience: SloAudience): string {
  const persona: ExplainPersona =
    audience === 'developer' ? 'engineer' : audience === 'product' ? 'product' : 'sales'
  return explainForPersona(m, persona)
}

function combineHealth(
  session: ReturnType<typeof computeSessionHealth> | null,
  slo: SloOverallStatus,
): CombinedHealthUi {
  const sRank =
    session == null ? 0 : session.status === 'critical' ? 2 : session.status === 'degraded' ? 1 : 0
  const sloRank = slo === 'critical' ? 2 : slo === 'warning' ? 1 : 0
  const rank = Math.max(sRank, sloRank)
  if (rank >= 2) return 'critical'
  if (rank >= 1) return 'warning'
  return 'healthy'
}

function buildOverviewBullets(
  sessionHealth: ReturnType<typeof computeSessionHealth> | null,
  sloOutcome: SloEvaluationOutcome,
  sessionExplainMetrics: SessionExplainMetrics | null,
  timelineRowsLength: number,
): string[] {
  const bullets: string[] = []
  if (timelineRowsLength === 0) {
    return ['No events captured yet — interact with the page or iframe to record a session.']
  }
  const failed = sloOutcome.results.filter((r) => r.status === 'fail')
  for (const r of failed.slice(0, 3)) {
    bullets.push(`SLO failed: ${r.definition.name}`)
  }
  const limited = sloOutcome.results.filter((r) => r.status === 'insufficient_sample').length
  if (limited > 0 && bullets.length < 5) {
    bullets.push(`${limited} SLO(s) need more data (open SLOs tab).`)
  }
  if (sessionHealth && sessionHealth.reasons.length > 0) {
    for (const reason of sessionHealth.reasons.slice(0, 2)) {
      if (bullets.length >= 5) break
      if (!bullets.some((b) => b.includes(reason.slice(0, 24)))) bullets.push(reason)
    }
  }
  if (sessionExplainMetrics && sessionExplainMetrics.failed401 > 0 && bullets.length < 5) {
    bullets.push('Unauthorized (401) responses detected on API calls.')
  }
  if (sessionExplainMetrics && sessionExplainMetrics.pageErrors > 0 && bullets.length < 5) {
    bullets.push('Runtime or page errors were recorded.')
  }
  if (bullets.length === 0) {
    bullets.push('No blocking issues flagged in this capture.')
  }
  return bullets.slice(0, 5)
}

export function InstrumentationBody() {
  const snap = useInstrumentation()
  const {
    recordingPaused,
    totalCalls,
    failedCalls,
    totalPageErrors,
    requests,
    errors,
    navigations,
    interframeMessages,
  } = snap

  const latestNav = navigations[0]

  /** Navigation marks use `0` until the corresponding event has fired; `0` is not a real duration. */
  const navMarkReady = (v: number) => Number.isFinite(v) && v > 0

  const domContentLoadedDisplay =
    latestNav != null && navMarkReady(latestNav.domContentLoaded)
      ? `${Math.round(latestNav.domContentLoaded)} ms`
      : '—'

  const loadEventDisplay =
    latestNav != null && navMarkReady(latestNav.loadEventEnd)
      ? `${Math.round(latestNav.loadEventEnd)} ms`
      : '—'

  const totalDelta =
    latestNav != null &&
    Number.isFinite(latestNav.startTime) &&
    latestNav.startTime >= 0 &&
    navMarkReady(latestNav.loadEventEnd)
      ? Math.round(latestNav.loadEventEnd - latestNav.startTime)
      : null
  const totalLoadDisplay =
    totalDelta != null && totalDelta > 0 ? `${totalDelta} ms` : '—'

  const pageSpeedMs =
    totalDelta != null && totalDelta > 0
      ? totalDelta
      : latestNav != null && navMarkReady(latestNav.domContentLoaded)
        ? Math.round(latestNav.domContentLoaded)
        : null

  type PageSpeedVariant = 'fast' | 'okay' | 'slow' | 'collecting'
  let pageSpeedVariant: PageSpeedVariant = 'collecting'
  let pageSpeedValueText = 'Collecting...'
  if (pageSpeedMs != null) {
    if (pageSpeedMs < 1000) {
      pageSpeedVariant = 'fast'
      pageSpeedValueText = 'Fast'
    } else if (pageSpeedMs <= 2500) {
      pageSpeedVariant = 'okay'
      pageSpeedValueText = 'Okay'
    } else {
      pageSpeedVariant = 'slow'
      pageSpeedValueText = 'Slow'
    }
  }

  const [panelTab, setPanelTab] = useState<PanelTab>('overview')
  const [detailTab, setDetailTab] = useState<TimelineDetailTab>('story')
  const [reqFilter, setReqFilter] = useState<RequestFilter>('all')
  const [audience, setAudience] = useState<SloAudience>('business')
  const [aiExplain, setAiExplain] = useState<string | null>(null)

  const onPauseToggle = useCallback(() => {
    setRecordingPaused(!recordingPaused)
  }, [recordingPaused])

  const onReset = useCallback(() => {
    resetInstrumentation()
    setReqFilter('all')
    setPanelTab('overview')
    setDetailTab('story')
  }, [])

  const filteredRequests = useMemo(() => {
    if (reqFilter === 'all') return requests
    if (reqFilter === 'failed') return requests.filter((r) => !r.success)
    return requests.filter((r) => r.requestKind === reqFilter)
  }, [requests, reqFilter])

  const timelineRows = useMemo((): TimelineRow[] => {
    const rows: TimelineRow[] = []
    for (const r of requests) {
      rows.push({
        kind: 'request',
        sortKey: r.endTime,
        rowKey: `req-${r.id}`,
        frameType: r.frameType,
        frameUrl: r.frameUrl,
        summary: requestStorySummary(r),
        preview: r.error
          ? shorten(r.error, 120)
          : `${r.durationMs} ms · ${kindLabel(r.requestKind)}`,
      })
    }
    for (const e of errors) {
      rows.push({
        kind: 'error',
        sortKey: e.timestamp,
        rowKey: `err-${e.id}`,
        frameType: e.frameType,
        frameUrl: e.frameUrl,
        summary: errorStorySummary(e),
        preview: e.stack ? shorten(e.stack, 120) : shorten(e.message, 120),
      })
    }
    for (const m of interframeMessages) {
      rows.push({
        kind: 'message',
        sortKey: m.timestamp,
        rowKey: `msg-${m.id}`,
        frameType: m.frameType,
        frameUrl: m.frameUrl,
        summary: `${normalizePostMessageDirection(m.direction)} · ${m.messageType}`,
        preview: shorten(m.preview, 120),
      })
    }
    rows.sort((a, b) => b.sortKey - a.sortKey)
    return rows
  }, [requests, errors, interframeMessages])

  const timelineWithLayout = useMemo(() => {
    const rows = timelineRows
    return rows.map((row, i) => {
      const prev = i > 0 ? rows[i - 1] : null
      const next = i < rows.length - 1 ? rows[i + 1] : null
      const groupStart =
        i > 0 && prev != null && prev.sortKey - row.sortKey > TIMELINE_GROUP_GAP_MS
      const flowPair =
        (prev != null &&
          prev.sortKey - row.sortKey <= TIMELINE_FLOW_PAIR_MS &&
          pairMessageRequest(prev.kind, row.kind)) ||
        (next != null &&
          row.sortKey - next.sortKey <= TIMELINE_FLOW_PAIR_MS &&
          pairMessageRequest(row.kind, next.kind))
      return { row, groupStart, flowPair }
    })
  }, [timelineRows])

  const { sessionSummaryLines, sessionExplainMetrics } = useMemo(() => {
    if (timelineRows.length === 0) {
      return {
        sessionSummaryLines: ['No events recorded yet in this session.'],
        sessionExplainMetrics: null,
      }
    }
    const chrono = [...timelineRows].sort((a, b) => a.sortKey - b.sortKey)
    const clusterCount = countTimelineClusters(chrono)
    const apiCalls = requests.length
    const messageCount = interframeMessages.length
    const pageErrors = errors.length
    const { complete, failed } = scanFlowPatterns(chrono)

    const successfulEval = requests.filter(
      (r) => pathLooksLikeEvaluate(r.url) && r.success && r.status === 200,
    ).length
    const failed401 = requests.filter((r) => r.status === 401).length
    const failedOther = requests.filter((r) => !r.success && r.status !== 401).length
    const anyFailedRequest = failed401 > 0 || failedOther > 0
    const hadPatientContext = interframeMessages.some((m) => m.messageType === 'patient_context')
    const hadCandidateResult = interframeMessages.some((m) => m.messageType === 'candidate_result')
    const evalRequest = requests.find((r) => pathLooksLikeEvaluate(r.url)) ?? null
    const distinctMessageTypes = [
      ...new Set(
        [...interframeMessages]
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((x) => x.messageType),
      ),
    ]

    const lines: string[] = []
    lines.push(
      `${clusterCount} flow cluster(s) (new cluster after ~1.8s without events).`,
    )
    lines.push(
      `${apiCalls} API call(s), ${messageCount} postMessage event(s), ${pageErrors} page error(s).`,
    )

    const outcomes: string[] = []
    if (successfulEval > 0) {
      outcomes.push(
        `${successfulEval} successful evaluation${successfulEval === 1 ? '' : 's'}`,
      )
    }
    if (failed401 > 0) {
      outcomes.push(
        `${failed401} failed request${failed401 === 1 ? '' : 's'} (401 unauthorized)`,
      )
    }
    if (failedOther > 0) {
      outcomes.push(
        `${failedOther} other failed API response${failedOther === 1 ? '' : 's'}`,
      )
    }
    if (outcomes.length > 0) {
      lines.push(`Key outcomes: ${outcomes.join('; ')}.`)
    }

    if (complete > 0) {
      lines.push(
        `${complete} complete flow${complete === 1 ? '' : 's'}: message → API → message.`,
      )
    }
    if (failed > 0) {
      lines.push(
        `${failed} failed flow${failed === 1 ? '' : 's'}: message → API → error.`,
      )
    }

    lines.push(`User triggered ${clusterCount} cluster(s) of activity in this session.`)
    if (messageCount > 0 && apiCalls > 0) {
      lines.push(
        'Typical embedded pattern: parent ↔ iframe messages plus API calls.',
      )
    }

    if (pageErrors === 0 && !anyFailedRequest) {
      lines.push('No errors occurred.')
    } else if (anyFailedRequest && pageErrors === 0) {
      lines.push('Errors are from failed API responses.')
    } else if (!anyFailedRequest && pageErrors > 0) {
      lines.push('Runtime / page errors occurred (no failed API responses).')
    } else {
      lines.push('Errors occurred during API calls and/or as runtime errors.')
    }

    const sessionExplainMetrics: SessionExplainMetrics = {
      clusterCount,
      apiCalls,
      messageCount,
      pageErrors,
      complete,
      failed,
      successfulEval,
      failed401,
      failedOther,
      anyFailedRequest,
      hadPatientContext,
      hadCandidateResult,
      distinctMessageTypes,
      evalRequest,
    }

    return { sessionSummaryLines: lines, sessionExplainMetrics }
  }, [timelineRows, requests, errors, interframeMessages])

  const sessionSignalsForAI = useMemo((): SessionSignals | null => {
    if (sessionExplainMetrics == null) return null
    return {
      clusterCount: sessionExplainMetrics.clusterCount,
      apiCalls: sessionExplainMetrics.apiCalls,
      messageCount: sessionExplainMetrics.messageCount,
      pageErrors: sessionExplainMetrics.pageErrors,
      completeFlows: sessionExplainMetrics.complete,
      failedFlows: sessionExplainMetrics.failed,
      successfulEval: sessionExplainMetrics.successfulEval,
      failed401: sessionExplainMetrics.failed401,
      failedOther: sessionExplainMetrics.failedOther,
      anyFailedRequest: sessionExplainMetrics.anyFailedRequest,
      hadPatientContext: sessionExplainMetrics.hadPatientContext,
    }
  }, [sessionExplainMetrics])

  const sessionHealth = useMemo(() => {
    if (!sessionSignalsForAI) return null
    return computeSessionHealth(sessionSignalsForAI)
  }, [sessionSignalsForAI])

  const sessionMetricsForSlo = useMemo(() => deriveSessionMetrics(snap), [snap])

  const sloOutcome = useMemo(
    () => evaluateSlos(ELEOS_DEFAULT_SLOS, sessionMetricsForSlo, audience),
    [sessionMetricsForSlo, audience],
  )

  const combinedHealthUi = useMemo(
    () => combineHealth(sessionHealth, sloOutcome.overall),
    [sessionHealth, sloOutcome.overall],
  )

  const failedSloNames = useMemo(
    () => sloOutcome.results.filter((r) => r.status === 'fail').map((r) => r.definition.name),
    [sloOutcome],
  )

  const sessionLine = useMemo(() => {
    if (timelineRows.length === 0) return 'No events yet'
    const times: number[] = []
    for (const r of requests) {
      times.push(r.startTime, r.endTime)
    }
    for (const e of errors) times.push(e.timestamp)
    for (const m of interframeMessages) times.push(m.timestamp)
    const fin = times.filter((t) => Number.isFinite(t))
    const spanMs = fin.length > 0 ? Math.max(...fin) - Math.min(...fin) : 0
    const spanPart = spanMs > 1500 ? `~${Math.round(spanMs / 1000)}s · ` : ''
    return `${spanPart}${timelineRows.length} events · ${requests.length} API · ${interframeMessages.length} msg · ${errors.length} err`
  }, [timelineRows.length, requests, errors, interframeMessages])

  const overviewBullets = useMemo(
    () => buildOverviewBullets(sessionHealth, sloOutcome, sessionExplainMetrics, timelineRows.length),
    [sessionHealth, sloOutcome, sessionExplainMetrics, timelineRows.length],
  )

  useEffect(() => {
    if (sessionSignalsForAI == null) {
      setAiExplain(null)
      return
    }
    setAiExplain(null)
    let cancelled = false
    void generateAIExplanation(sessionSignalsForAI).then((text) => {
      if (!cancelled) setAiExplain(text)
    })
    return () => {
      cancelled = true
    }
  }, [sessionSignalsForAI])

  const sessionExplainParagraph = useMemo(() => {
    if (sessionExplainMetrics == null) {
      return 'No activity has been captured yet. Interact with the page or embedded iframe to build a session story.'
    }
    return aiExplain ?? explainForSloAudience(sessionExplainMetrics, audience)
  }, [sessionExplainMetrics, audience, aiExplain])

  const sloOverallLabel =
    sloOutcome.overall === 'healthy'
      ? 'All SLOs pass'
      : sloOutcome.overall === 'warning'
        ? 'SLO warning'
        : 'SLO critical'

  const filterChip = (id: RequestFilter, label: string) => (
    <button
      key={id}
      type="button"
      className={`elk-perf-chip${reqFilter === id ? ' elk-perf-chip--on' : ''}`}
      onClick={() => setReqFilter(id)}
    >
      {label}
    </button>
  )

  const detailTabBtn = (id: TimelineDetailTab, label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={detailTab === id}
      className={`elk-perf-tab elk-perf-tab--sub${detailTab === id ? ' elk-perf-tab--active' : ''}`}
      onClick={() => setDetailTab(id)}
    >
      {label}
      {count != null ? <span className="elk-perf-tab-count">{count}</span> : null}
    </button>
  )

  return (
    <div className="elk-perf-instrumentation">
      <PanelStickyBar
        combinedHealth={combinedHealthUi}
        appName="Eleos"
        sessionLine={sessionLine}
        failedSloNames={failedSloNames}
        audience={audience}
        onAudienceChange={setAudience}
      />

      <p className="elk-perf-scope-line elk-perf-scope-line--compact">
        Extension panel · network, errors, nav, and postMessage aggregated here.
      </p>

      <div className="elk-perf-toolbar elk-perf-toolbar--compact">
        <div className="elk-perf-toolbar-status">
          <span className={recordingPaused ? 'elk-perf-status elk-perf-status--paused' : 'elk-perf-status'}>
            {recordingPaused ? 'Paused' : 'Recording'}
          </span>
          <span className="elk-perf-toolbar-hint">Caps: 200 req / 100 err / 100 msg.</span>
        </div>
        <div className="elk-perf-toolbar-actions">
          <button type="button" className="elk-perf-text-btn" onClick={onPauseToggle}>
            {recordingPaused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="elk-perf-text-btn" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      <div className="elk-perf-tab-bar elk-perf-tab-bar--main" role="tablist" aria-label="Panel sections">
        <button
          type="button"
          role="tab"
          aria-selected={panelTab === 'journey'}
          className={`elk-perf-tab${panelTab === 'journey' ? ' elk-perf-tab--active' : ''}`}
          onClick={() => setPanelTab('journey')}
        >
          Journey
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panelTab === 'overview'}
          className={`elk-perf-tab${panelTab === 'overview' ? ' elk-perf-tab--active' : ''}`}
          onClick={() => setPanelTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panelTab === 'slos'}
          className={`elk-perf-tab${panelTab === 'slos' ? ' elk-perf-tab--active' : ''}`}
          onClick={() => setPanelTab('slos')}
        >
          SLOs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panelTab === 'timeline'}
          className={`elk-perf-tab${panelTab === 'timeline' ? ' elk-perf-tab--active' : ''}`}
          onClick={() => setPanelTab('timeline')}
        >
          Timeline
        </button>
      </div>

      {panelTab === 'journey' ? (
        <section className="elk-perf-section" aria-label="Journey">
          <JourneyTab />
        </section>
      ) : panelTab === 'overview' ? (
        <section className="elk-perf-section elk-perf-overview" aria-label="Overview">
          <div className="elk-perf-overview-health-card">
            <div className={`elk-perf-overview-health-pill elk-perf-overview-health-pill--${combinedHealthUi}`}>
              {combinedHealthUi === 'healthy'
                ? 'Healthy'
                : combinedHealthUi === 'warning'
                  ? 'Warning'
                  : 'Critical'}
            </div>
            <div className="elk-perf-overview-health-grid">
              {sessionHealth ? (
                <div className="elk-perf-overview-health-row">
                  <span className="elk-perf-overview-health-k">Session</span>
                  <span className={`elk-perf-overview-health-v elk-perf-overview-health-v--${sessionHealth.status}`}>
                    {sessionHealth.status} · score {sessionHealth.score}
                  </span>
                </div>
              ) : null}
              <div className="elk-perf-overview-health-row">
                <span className="elk-perf-overview-health-k">SLOs</span>
                <span className="elk-perf-overview-health-v">{sloOverallLabel}</span>
              </div>
              <div className="elk-perf-overview-health-row">
                <span className="elk-perf-overview-health-k">Page speed</span>
                <span className={`elk-perf-overview-health-v elk-perf-page-speed-value--${pageSpeedVariant}`}>
                  {pageSpeedValueText}
                </span>
              </div>
            </div>
          </div>
          <div className="elk-perf-overview-bullets-wrap">
            <div className="elk-perf-overview-bullets-title">Key issues</div>
            <ul className="elk-perf-overview-bullets">
              {overviewBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="elk-perf-overview-explain">
            <div className="elk-perf-overview-explain-title">
              Session story ({audience === 'developer' ? 'Developer' : audience === 'product' ? 'Product' : 'Business'}{' '}
              view)
            </div>
            <p className="elk-perf-overview-explain-body">{sessionExplainParagraph}</p>
          </div>
        </section>
      ) : panelTab === 'slos' ? (
        <section className="elk-perf-section" aria-label="SLOs">
          <SloTabPanel outcome={sloOutcome} metrics={sessionMetricsForSlo} />
        </section>
      ) : (
        <section className="elk-perf-section elk-perf-timeline-tab" aria-label="Timeline">
          <div className="elk-perf-compact-load-row">
            <span className="elk-perf-compact-load-item">
              <span className="elk-perf-compact-load-k">DCL</span> {domContentLoadedDisplay}
            </span>
            <span className="elk-perf-compact-load-item">
              <span className="elk-perf-compact-load-k">Load</span> {loadEventDisplay}
            </span>
            <span className="elk-perf-compact-load-item">
              <span className="elk-perf-compact-load-k">Total</span> {totalLoadDisplay}
            </span>
            <span className={`elk-perf-compact-load-speed elk-perf-page-speed-value--${pageSpeedVariant}`}>
              {pageSpeedValueText}
            </span>
          </div>
          {latestNav == null ? (
            <p className="elk-perf-page-load-empty elk-perf-page-load-empty--inline">
              Navigation timing not captured (reload).
            </p>
          ) : null}

          <div className="elk-perf-stats elk-perf-stats--compact">
            <span className="elk-perf-stat-inline">
              <span className="elk-perf-stat-label">Calls</span> {totalCalls}
            </span>
            <span className="elk-perf-stat-inline">
              <span className="elk-perf-stat-label">Failed</span>{' '}
              <span className={failedCalls > 0 ? 'elk-perf-stat-value--warn' : ''}>{failedCalls}</span>
            </span>
            <span className="elk-perf-stat-inline">
              <span className="elk-perf-stat-label">Errors</span>{' '}
              <span className={totalPageErrors > 0 ? 'elk-perf-stat-value--warn' : ''}>{totalPageErrors}</span>
            </span>
          </div>

          <details className="elk-perf-details-block">
            <summary>Session summary</summary>
            <ul className="elk-perf-session-summary-list">
              {sessionSummaryLines.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </details>

          <p className="elk-perf-timeline-overview-hint">
            Session narrative (audience-specific): open the <strong>Overview</strong> tab — use the header
            audience toggle (Developer / Product / Business).
          </p>

          <div className="elk-perf-tab-bar elk-perf-tab-bar--sub" role="tablist" aria-label="Timeline detail">
            {detailTabBtn('story', 'Story', timelineRows.length)}
            {detailTabBtn('requests', 'Requests', requests.length)}
            {detailTabBtn('errors', 'Errors', errors.length)}
            {detailTabBtn('messages', 'Messages', interframeMessages.length)}
          </div>

          {detailTab === 'story' ? (
            <>
              <p className="elk-perf-timeline-hint">
                Newest first. Clusters ~1.8s; message↔request pairs within ~0.5s highlighted.
              </p>
              {timelineRows.length === 0 ? (
                <p className="elk-perf-empty">No timeline events yet.</p>
              ) : (
                <ul className="elk-perf-list elk-perf-tl-list">
                  {timelineWithLayout.map(({ row, groupStart, flowPair }) => {
                    const kindUpper =
                      row.kind === 'request' ? 'REQUEST' : row.kind === 'error' ? 'ERROR' : 'MESSAGE'
                    const glyph =
                      row.kind === 'message' ? '↔' : row.kind === 'request' ? '↓' : '⚠'
                    const ft = row.frameType
                    const frameBadgeText = ft === 'top' ? 'TOP' : ft === 'iframe' ? 'IFRAME' : null
                    const clock = formatClock(row.sortKey)
                    return (
                      <li
                        key={row.rowKey}
                        className={[
                          'elk-perf-list-item',
                          'elk-perf-tl',
                          groupStart ? 'elk-perf-tl-group-start' : '',
                          flowPair ? 'elk-perf-tl-flow' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="elk-perf-tl-row">
                          <span className={`elk-perf-tl-kind elk-perf-tl-kind--${row.kind}`}>
                            <span className={`elk-perf-tl-glyph elk-perf-tl-glyph--${row.kind}`} aria-hidden>
                              {glyph}
                            </span>
                            {kindUpper}
                          </span>
                          <span className="elk-perf-tl-time">{clock}</span>
                          {frameBadgeText ? (
                            <span className="elk-perf-frame-badge elk-perf-frame-badge--caps" title={row.frameUrl}>
                              <span className="elk-perf-frame-tier">{frameBadgeText}</span>
                              {row.frameUrl ? ` · ${shorten(row.frameUrl, 36)}` : ''}
                            </span>
                          ) : null}
                        </div>
                        <div className="elk-perf-tl-summary" title={row.summary}>
                          {row.summary}
                        </div>
                        {row.preview ? (
                          <div className="elk-perf-tl-preview" title={row.preview}>
                            {row.preview}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : detailTab === 'requests' ? (
            <>
              <div className="elk-perf-filter-row">
                {filterChip('all', 'All')}
                {filterChip('failed', 'Failed')}
                {filterChip('api-bff', 'API/BFF')}
                {filterChip('frontend', 'Frontend')}
                {filterChip('external', 'External')}
                {filterChip('unknown', 'Unknown')}
              </div>
              {filteredRequests.length === 0 ? (
                <p className="elk-perf-empty">
                  {requests.length === 0
                    ? 'No requests captured yet.'
                    : 'No requests match this filter.'}
                </p>
              ) : (
                <ul className="elk-perf-list">
                  {filteredRequests.map((r) => {
                    const reqFrame = frameLabel(r.frameType, r.frameUrl)
                    return (
                      <li
                        key={r.id}
                        className={`elk-perf-list-item elk-perf-req${r.success ? '' : ' elk-perf-req--bad'}`}
                      >
                        <div className="elk-perf-req-row">
                          <span className="elk-perf-req-kind">{r.source.toUpperCase()}</span>
                          <span className={`elk-perf-kind-badge elk-perf-kind-badge--${r.requestKind}`}>
                            {kindLabel(r.requestKind)}
                          </span>
                          <span className="elk-perf-req-method">{r.method}</span>
                          <span className="elk-perf-req-status">{statusLabel(r.status, r.success)}</span>
                          <span className="elk-perf-req-ms">{r.durationMs} ms</span>
                        </div>
                        <div className="elk-perf-req-meta">
                          {formatClock(r.startTime)} → {formatClock(r.endTime)}
                          {reqFrame ? (
                            <span className="elk-perf-frame-badge" title={r.frameUrl}>
                              {reqFrame}
                            </span>
                          ) : null}
                        </div>
                        <div className="elk-perf-req-url" title={r.url}>
                          {shorten(r.url, 72)}
                        </div>
                        {r.error ? <div className="elk-perf-req-err">{r.error}</div> : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : detailTab === 'errors' ? (
            <>
              {errors.length === 0 ? (
                <p className="elk-perf-empty">No runtime errors or unhandled rejections yet.</p>
              ) : (
                <ul className="elk-perf-list">
                  {errors.map((e) => {
                    const errFrame = frameLabel(e.frameType, e.frameUrl)
                    return (
                      <li key={e.id} className="elk-perf-list-item elk-perf-err">
                        <div className="elk-perf-err-row">
                          <span className="elk-perf-err-src">
                            {e.type === 'runtime-error' ? 'Runtime error' : 'Unhandled rejection'}
                          </span>
                          <span className="elk-perf-err-time">{formatClock(e.timestamp)}</span>
                          {errFrame ? (
                            <span className="elk-perf-frame-badge" title={e.frameUrl}>
                              {errFrame}
                            </span>
                          ) : null}
                        </div>
                        <div className="elk-perf-err-msg">{e.message}</div>
                        {e.stack ? <pre className="elk-perf-err-detail">{shorten(e.stack, 600)}</pre> : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : (
            <>
              {interframeMessages.length === 0 ? (
                <p className="elk-perf-empty">
                  No cross-frame postMessage with a string{' '}
                  <code className="elk-perf-code-inline">type</code> yet.
                </p>
              ) : (
                <ul className="elk-perf-list">
                  {interframeMessages.map((m) => {
                    const frameBadgeText =
                      m.frameType === 'top' ? 'TOP' : m.frameType === 'iframe' ? 'IFRAME' : m.frameType
                    return (
                      <li key={m.id} className="elk-perf-list-item elk-perf-msg">
                        <div className="elk-perf-msg-row">
                          <span className="elk-perf-msg-dir" title={m.direction}>
                            {m.direction}
                          </span>
                          <span className="elk-perf-msg-type">{m.messageType}</span>
                          <span className="elk-perf-msg-time">{formatClock(m.timestamp)}</span>
                          <span className="elk-perf-frame-badge elk-perf-frame-badge--caps" title={m.frameUrl}>
                            <span className="elk-perf-frame-tier">{frameBadgeText}</span>
                            {m.frameUrl ? ` · ${shorten(m.frameUrl, 40)}` : ''}
                          </span>
                        </div>
                        <div className="elk-perf-msg-preview" title={m.preview}>
                          {shorten(m.preview, 120)}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
