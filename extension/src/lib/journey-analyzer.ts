import type {
  ErrorPayload,
  MilestonePayload,
  RequestPayload,
  UserInteractionPayload,
} from '../core/bridge-protocol'
import type { InterframePostMessage } from '../core/instrumentation-store'
import { NextJsDetector, type NextJsContext } from './nextjs-detector'

export type JourneyStepStatus = 'success' | 'error' | 'slow' | 'pending'

/** Extract a short path label from a full URL for display (falls back to full URL). */
function getRequestPathLabel(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname || parsed.href
  } catch {
    return url
  }
}

/** Format request duration in ms or seconds for compact display. */
function formatRequestDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export type RequestCategory =
  | 'Final Submission'
  | 'Internal Save'
  | 'Contact Save'
  | 'External Integration'
  | 'UI Refresh'
  | 'Analytics'
  | 'Other'

/** Hosts known to be analytics / browser monitoring / telemetry services. */
const ANALYTICS_HOST_PATTERNS: RegExp[] = [
  /(^|\.)heap(analytics)?\.com$/i,
  /(^|\.)heap-api\.com$/i,
  /(^|\.)nr-data\.net$/i,
  /(^|\.)newrelic\.com$/i,
  /(^|\.)segment\.(com|io)$/i,
  /(^|\.)mixpanel\.com$/i,
  /(^|\.)amplitude\.com$/i,
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)datadoghq\.com$/i,
  /(^|\.)sentry\.io$/i,
  /(^|\.)fullstory\.com$/i,
  /(^|\.)hotjar\.com$/i,
  /(^|\.)logrocket\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)facebook\.(com|net)$/i,
]

/** Internal service host patterns (treated as first-party even if not on localhost). */
const INTERNAL_HOST_PATTERNS: RegExp[] = [
  /(^|\.)sycle\.(com|net)$/i,
  /(^|\.)sycle-[a-z0-9-]+\.(com|net)$/i,
]

/** Window (ms) after a Submit Referral click during which subsequent requests are treated as children. */
const SUBMIT_REFERRAL_WINDOW_MS = 10000

/** Detect if interaction's target text is a Submit Referral click. */
function isSubmitReferralClick(interaction: UserInteractionPayload): boolean {
  if (interaction.interactionType !== 'click') return false
  const text = (interaction.targetText || '').trim().toLowerCase()
  return text.includes('submit referral')
}

/** Classify a network request into a business category using URL/method heuristics. */
export function categorizeRequest(req: RequestPayload): RequestCategory {
  const method = req.method.toUpperCase()

  let host = ''
  let pathname = req.url
  try {
    const parsed = new URL(req.url)
    host = parsed.hostname.toLowerCase()
    pathname = parsed.pathname.toLowerCase()
  } catch {
    pathname = req.url.toLowerCase()
  }

  // Analytics / telemetry / monitoring — highest priority so they don't leak into other categories
  if (host && ANALYTICS_HOST_PATTERNS.some((p) => p.test(host))) return 'Analytics'

  // Final Submission: the primary referral submit action
  if (/\/ci-refer\/referrals\/[^/]+\/submit\b/.test(pathname)) {
    return 'Final Submission'
  }

  // Contact Save: contact-related writes under ci-refer
  if (pathname.includes('/ci-refer/contact/')) {
    return 'Contact Save'
  }

  // Internal Save: anything else under the ci-refer internal app
  if (pathname.includes('/ci-refer/')) {
    return 'Internal Save'
  }

  // UI Refresh: SNS actions feed
  if (pathname.includes('/api/sns/')) {
    return 'UI Refresh'
  }

  // Legacy internal save patterns (generic referral POSTs)
  if (method === 'POST' && (pathname.includes('/api/referral') || pathname.includes('/api/submit'))) {
    return 'Internal Save'
  }

  // Determine if host looks first-party (internal) before labeling as external
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || host === ''
  const isInternalHost = INTERNAL_HOST_PATTERNS.some((p) => p.test(host))

  // External Integration: true third-party business integrations only
  if (!isLocalHost && !isInternalHost) {
    if (/(^|\.)cochlear\.(com|co|io)$/i.test(host) || pathname.includes('/external/')) {
      return 'External Integration'
    }
    // Unknown external host — conservatively mark as External Integration
    return 'External Integration'
  }

  // Internal GETs to /api/* are UI refresh by default
  if (method === 'GET' && pathname.includes('/api/')) {
    return 'UI Refresh'
  }

  return 'Other'
}

export type JourneyStep = {
  id: string
  name: string
  description: string
  timestamp: number
  duration: number
  status: JourneyStepStatus
  
  // Next.js context
  nextJsContext?: NextJsContext
  
  // Related events
  requests: RequestPayload[]
  errors: ErrorPayload[]
  interactions: UserInteractionPayload[]
  messages: InterframePostMessage[]
  milestones: MilestonePayload[]
  
  // Metadata
  frameType?: 'top' | 'iframe'
  isUserVisible: boolean
  isCriticalPath: boolean

  // Semantic workflow marker (e.g. grouped Submit Referral action with child requests)
  workflowType?: 'submit-referral'
}

export type AmbientPattern = {
  method: string
  normalizedPath: string
  frameType: 'top' | 'iframe'
  count: number
  firstSeen: number
  lastSeen: number
  avgDurationMs: number
  medianDurationMs: number
  totalSpanMs: number
  requestIds: string[]
}

export type AmbientActivity = {
  patterns: AmbientPattern[]
  totalCalls: number
}

export type JourneyAnalysis = {
  steps: JourneyStep[]
  totalDuration: number
  successRate: number
  errorCount: number
  cacheHitRate: number
  serverCallCount: number
  userWaitTime: number
  status: 'success' | 'partial' | 'error'
  ambientActivity: AmbientActivity
}

/** Minimum number of repeats to treat a request family as ambient. */
const AMBIENT_MIN_COUNT = 5
/** Minimum wall-clock span (ms) across the family. */
const AMBIENT_MIN_SPAN_MS = 10000

/**
 * Normalize a URL path by replacing dynamic segments (numeric ids, UUIDs, hex,
 * long opaque tokens) with `:id`. Helps collapse request families like
 * `/api/sns/getNew/123/since/abc` and `/api/sns/getNew/999/since/def` into a
 * single pattern.
 */
function normalizeRoutePath(url: string): string {
  let pathname = url
  try {
    pathname = new URL(url).pathname
  } catch {
    // use raw
  }
  const segments = pathname.split('/').map((seg) => {
    if (!seg) return seg
    // Numeric ids
    if (/^\d+$/.test(seg)) return ':id'
    // UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':id'
    // Long hex / base64-ish tokens (cursors)
    if (/^[0-9a-f]{12,}$/i.test(seg)) return ':cursor'
    if (/^[A-Za-z0-9_-]{24,}$/.test(seg)) return ':cursor'
    return seg
  })
  return segments.join('/')
}

/** Compute median of a numeric array without mutating it. */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Detect repeated background polling / ambient request families.
 * Excludes requests that fall inside an active submit-referral workflow window.
 * Returns patterns plus the set of request ids that were classified as ambient.
 */
function detectAmbientActivity(
  requests: RequestPayload[],
  submitReferralStartTimes: number[],
): { patterns: AmbientPattern[]; ambientRequestIds: Set<string> } {
  const isInSubmitWindow = (ts: number): boolean =>
    submitReferralStartTimes.some((start) => ts >= start && ts - start <= SUBMIT_REFERRAL_WINDOW_MS)

  // Group by {method|normalizedPath|frameType}
  const groups = new Map<string, RequestPayload[]>()
  for (const req of requests) {
    if (isInSubmitWindow(req.startTime)) continue
    const key = `${req.method.toUpperCase()}|${normalizeRoutePath(req.url)}|${req.frameType ?? 'top'}`
    const arr = groups.get(key) ?? []
    arr.push(req)
    groups.set(key, arr)
  }

  const patterns: AmbientPattern[] = []
  const ambientRequestIds = new Set<string>()

  for (const [key, reqs] of groups) {
    if (reqs.length < AMBIENT_MIN_COUNT) continue
    const timestamps = reqs.map((r) => r.startTime)
    const firstSeen = Math.min(...timestamps)
    const lastSeen = Math.max(...timestamps)
    const span = lastSeen - firstSeen
    if (span < AMBIENT_MIN_SPAN_MS) continue

    const durations = reqs.map((r) => r.durationMs)
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length

    const [method, normalizedPath, frameType] = key.split('|')
    patterns.push({
      method,
      normalizedPath,
      frameType: (frameType === 'iframe' ? 'iframe' : 'top') as 'top' | 'iframe',
      count: reqs.length,
      firstSeen,
      lastSeen,
      avgDurationMs: avg,
      medianDurationMs: median(durations),
      totalSpanMs: span,
      requestIds: reqs.map((r) => r.id),
    })
    reqs.forEach((r) => ambientRequestIds.add(r.id))
  }

  // Sort by count desc so biggest offenders surface first
  patterns.sort((a, b) => b.count - a.count)
  return { patterns, ambientRequestIds }
}

export type JourneyMetrics = {
  timeToComplete: number
  stepsCompleted: number
  totalSteps: number
  completionRate: number
  errorCount: number
  cacheHitRate: number
  serverCalls: number
  userWaitTime: number
  averageStepDuration: number
}

/**
 * Analyzes captured events to build a user journey with Next.js context
 */
export class JourneyAnalyzer {
  /**
   * Analyze all captured events and build journey steps
   */
  static analyzeJourney(
    requests: RequestPayload[],
    errors: ErrorPayload[],
    interactions: UserInteractionPayload[],
    messages: InterframePostMessage[],
    milestones: MilestonePayload[],
    navigations: any[],
  ): JourneyAnalysis {
    // Combine all events with timestamps
    const allEvents = this.combineAndSortEvents(
      requests,
      errors,
      interactions,
      messages,
      milestones,
      navigations,
    )

    // Build journey steps from events
    const steps = this.buildJourneySteps(allEvents, requests, errors, interactions, messages, milestones)

    // Calculate metrics
    const metrics = this.calculateMetrics(steps, requests, errors)

    // Ambient activity is a side analysis only — it does NOT modify the event
    // stream or steps. It just summarizes repeated background polling families.
    const submitReferralStartTimes = interactions
      .filter(isSubmitReferralClick)
      .map((i) => i.timestamp)
    const { patterns: ambientPatterns } = detectAmbientActivity(requests, submitReferralStartTimes)

    return {
      steps,
      totalDuration: metrics.timeToComplete,
      successRate: metrics.completionRate,
      errorCount: metrics.errorCount,
      cacheHitRate: metrics.cacheHitRate,
      serverCallCount: metrics.serverCalls,
      userWaitTime: metrics.userWaitTime,
      status: this.determineOverallStatus(steps, errors),
      ambientActivity: {
        patterns: ambientPatterns,
        totalCalls: ambientPatterns.reduce((sum, p) => sum + p.count, 0),
      },
    }
  }

  /**
   * Combine all events and sort by timestamp
   */
  private static combineAndSortEvents(
    requests: RequestPayload[],
    errors: ErrorPayload[],
    interactions: UserInteractionPayload[],
    messages: InterframePostMessage[],
    milestones: MilestonePayload[],
    navigations: any[],
  ): Array<{ timestamp: number; type: string; data: any }> {
    const events: Array<{ timestamp: number; type: string; data: any }> = []

    requests.forEach((r) => events.push({ timestamp: r.startTime, type: 'request', data: r }))
    errors.forEach((e) => events.push({ timestamp: e.timestamp, type: 'error', data: e }))
    interactions.forEach((i) => events.push({ timestamp: i.timestamp, type: 'interaction', data: i }))
    messages.forEach((m) => events.push({ timestamp: m.timestamp, type: 'message', data: m }))
    milestones.forEach((m) => events.push({ timestamp: m.timestamp, type: 'milestone', data: m }))
    navigations.forEach((n) => events.push({ timestamp: n.startTime, type: 'navigation', data: n }))

    return events.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Build journey steps from events
   */
  private static buildJourneySteps(
    allEvents: Array<{ timestamp: number; type: string; data: any }>,
    requests: RequestPayload[],
    errors: ErrorPayload[],
    interactions: UserInteractionPayload[],
    messages: InterframePostMessage[],
    milestones: MilestonePayload[],
  ): JourneyStep[] {
    const steps: JourneyStep[] = []

    // Group events into logical steps based on milestones and interactions
    let currentStepEvents: typeof allEvents = []
    let stepStartTime = allEvents[0]?.timestamp || Date.now()
    // Track an active Submit Referral workflow that absorbs subsequent requests
    let submitReferralStart: number | null = null

    const flushStep = () => {
      if (currentStepEvents.length === 0) return
      const step = this.createStepFromEvents(currentStepEvents, stepStartTime)
      if (step) steps.push(step)
      currentStepEvents = []
    }

    allEvents.forEach((event, index) => {
      const isSubmitReferral =
        event.type === 'interaction' &&
        event.data.interactionType === 'click' &&
        isSubmitReferralClick(event.data)

      const isBoundary =
        event.type === 'milestone' ||
        (event.type === 'interaction' &&
          (event.data.interactionType === 'click' || event.data.interactionType === 'submit'))

      // If we're in an active Submit Referral workflow, check whether this event should close it
      if (submitReferralStart !== null) {
        const withinWindow = event.timestamp - submitReferralStart <= SUBMIT_REFERRAL_WINDOW_MS
        const shouldCloseWorkflow = !withinWindow || isBoundary

        if (shouldCloseWorkflow) {
          flushStep()
          stepStartTime = event.timestamp
          submitReferralStart = null
          // fall through to normal handling for this event below
        } else {
          // absorb as child of Submit Referral workflow
          currentStepEvents.push(event)
          if (index === allEvents.length - 1) flushStep()
          return
        }
      }

      currentStepEvents.push(event)

      if (isSubmitReferral) {
        // Start a Submit Referral workflow — don't close the step yet
        submitReferralStart = event.timestamp
        if (index === allEvents.length - 1) flushStep()
        return
      }

      const shouldCreateStep = isBoundary || index === allEvents.length - 1
      if (shouldCreateStep) {
        flushStep()
        stepStartTime = event.timestamp
      }
    })

    return steps
  }

  /**
   * Create a journey step from a group of events
   */
  private static createStepFromEvents(
    events: Array<{ timestamp: number; type: string; data: any }>,
    startTime: number,
  ): JourneyStep | null {
    if (events.length === 0) return null

    const lastTs = events[events.length - 1]?.timestamp
    const endTime = typeof lastTs === 'number' && Number.isFinite(lastTs) ? lastTs : startTime
    const rawDuration = endTime - startTime
    const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0

    // Find the primary event (milestone or interaction)
    const primaryEvent =
      events.find((e) => e.type === 'milestone') ||
      events.find((e) => e.type === 'interaction') ||
      events[0]

    // Extract events by type
    const stepRequests = events.filter((e) => e.type === 'request').map((e) => e.data)
    const stepErrors = events.filter((e) => e.type === 'error').map((e) => e.data)
    const stepInteractions = events.filter((e) => e.type === 'interaction').map((e) => e.data)
    const stepMessages = events.filter((e) => e.type === 'message').map((e) => e.data)
    const stepMilestones = events.filter((e) => e.type === 'milestone').map((e) => e.data)

    // Determine step name and description
    // Fallback priority: interaction label → request label → generic system/background event
    let name: string
    let description: string
    if (stepInteractions.length > 0) {
      const i = stepInteractions[0]
      name = i.targetText || `User ${i.interactionType}`
      description = `User ${i.interactionType}${i.targetText ? ` on "${i.targetText}"` : ''}`
    } else if (stepRequests.length > 0) {
      const r = stepRequests[0]
      let path = r.url
      try {
        path = new URL(r.url).pathname || r.url
      } catch {
        /* keep raw */
      }
      name = `${r.method} ${path}`
      description = `${r.method} ${r.url}`
    } else if (stepMilestones.length > 0) {
      name = 'System event'
      description = stepMilestones[0].description || 'System event'
    } else {
      name = 'Background activity'
      description = 'Background activity'
    }

    if (primaryEvent.type === 'milestone') {
      // Map milestone names to display-friendly names
      if (primaryEvent.data.name === 'referral_started') {
        name = 'Referral Started'
      } else {
        name = primaryEvent.data.name
      }
      description = primaryEvent.data.description
    } else if (primaryEvent.type === 'interaction') {
      if (isSubmitReferralClick(primaryEvent.data)) {
        name = 'Submit Referral'
        description =
          stepRequests.length > 0
            ? `User submitted referral — ${stepRequests.length} request${stepRequests.length === 1 ? '' : 's'} triggered`
            : 'User submitted referral'
      } else {
        name = `User ${primaryEvent.data.interactionType}`
        description = `User ${primaryEvent.data.interactionType} on ${primaryEvent.data.target}`
      }
    } else if (stepRequests.length > 0) {
      // Request-only step: show method + path + status + duration
      const primaryRequest = stepRequests[0]
      const pathLabel = getRequestPathLabel(primaryRequest.url)
      const statusLabel = primaryRequest.status ?? 'failed'
      const durationLabel = formatRequestDuration(primaryRequest.durationMs)
      name = `${primaryRequest.method} ${pathLabel} — ${statusLabel} — ${durationLabel}`
      description =
        stepRequests.length > 1
          ? `${stepRequests.length} requests triggered`
          : `${primaryRequest.method} ${primaryRequest.url}`
    }

    // Analyze Next.js context from requests
    let nextJsContext: NextJsContext | undefined
    if (stepRequests.length > 0) {
      nextJsContext = NextJsDetector.analyzeRequest(stepRequests[0])
    }

    // Determine status
    const status = this.determineStepStatus(stepRequests, stepErrors, duration)

    return {
      id: `step-${startTime}`,
      name,
      description,
      timestamp: startTime,
      duration,
      status,
      nextJsContext,
      requests: stepRequests,
      errors: stepErrors,
      interactions: stepInteractions,
      messages: stepMessages,
      milestones: stepMilestones,
      frameType: primaryEvent.data.frameType ?? stepRequests[0]?.frameType,
      isUserVisible: this.isUserVisibleStep(primaryEvent),
      isCriticalPath: this.isCriticalPathStep(primaryEvent, stepRequests),
      workflowType:
        primaryEvent.type === 'interaction' && isSubmitReferralClick(primaryEvent.data)
          ? 'submit-referral'
          : undefined,
    }
  }

  /**
   * Determine step status based on errors and timing
   */
  private static determineStepStatus(
    requests: RequestPayload[],
    errors: ErrorPayload[],
    duration: number,
  ): JourneyStepStatus {
    if (errors.length > 0) return 'error'
    if (requests.some((r) => !r.success)) return 'error'
    if (duration > 3000) return 'slow' // > 3 seconds is slow
    return 'success'
  }

  /**
   * Check if step is user-visible (affects UX)
   */
  private static isUserVisibleStep(event: { type: string; data: any }): boolean {
    if (event.type === 'milestone') {
      const name = event.data.name
      return (
        name === 'page_loaded' ||
        name === 'dom_ready' ||
        name === 'first_interaction' ||
        name === 'iframes_detected'
      )
    }
    if (event.type === 'interaction') {
      return true
    }
    return false
  }

  /**
   * Check if step is on critical path (blocks user progress)
   */
  private static isCriticalPathStep(event: { type: string; data: any }, requests: RequestPayload[]): boolean {
    // Page load is critical
    if (event.type === 'milestone' && event.data.name === 'page_loaded') return true

    // User interactions are critical
    if (event.type === 'interaction') return true

    // API calls that block UI are critical
    if (requests.some((r) => r.requestKind === 'api-bff')) return true

    return false
  }

  /**
   * Calculate journey metrics
   */
  static calculateMetrics(steps: JourneyStep[], requests: RequestPayload[], errors: ErrorPayload[]): JourneyMetrics {
    const totalSteps = steps.length
    const completedSteps = steps.filter((s) => s.status === 'success').length

    const startTime = steps[0]?.timestamp || 0
    const endTime = steps[steps.length - 1]?.timestamp || 0
    const rawTimeToComplete = endTime - startTime
    const timeToComplete =
      Number.isFinite(rawTimeToComplete) && rawTimeToComplete > 0 ? rawTimeToComplete : 0

    // Calculate cache hit rate
    const nextJsRequests = requests.filter((r) => r.url.includes('/_next/') || r.url.includes('/api/'))
    const cachedRequests = nextJsRequests.filter((r) => {
      const context = NextJsDetector.analyzeRequest(r)
      return context.wasCached
    })
    const cacheHitRate = nextJsRequests.length > 0 ? (cachedRequests.length / nextJsRequests.length) * 100 : 0

    // Count server calls
    const serverCalls = requests.filter((r) => {
      const context = NextJsDetector.analyzeRequest(r)
      return context.wasServerRendered || r.requestKind === 'api-bff'
    }).length

    // Calculate user wait time (time in slow steps)
    const userWaitTime = steps.filter((s) => s.status === 'slow').reduce((sum, s) => sum + s.duration, 0)

    return {
      timeToComplete,
      stepsCompleted: completedSteps,
      totalSteps,
      completionRate: totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0,
      errorCount: errors.length,
      cacheHitRate,
      serverCalls,
      userWaitTime,
      averageStepDuration: totalSteps > 0 ? timeToComplete / totalSteps : 0,
    }
  }

  /**
   * Determine overall journey status
   */
  private static determineOverallStatus(steps: JourneyStep[], errors: ErrorPayload[]): 'success' | 'partial' | 'error' {
    if (errors.length > 0) return 'error'
    if (steps.some((s) => s.status === 'error')) return 'error'
    if (steps.some((s) => s.status === 'slow')) return 'partial'
    return 'success'
  }

  /**
   * Get session health label
   */
  static getSessionHealthLabel(metrics: JourneyMetrics): 'Excellent' | 'Good' | 'Fair' | 'Poor' {
    const score =
      (metrics.completionRate / 100) * 40 + // 40% weight on completion
      (metrics.cacheHitRate / 100) * 30 + // 30% weight on caching
      (metrics.errorCount === 0 ? 1 : 0) * 30 // 30% weight on no errors

    if (score >= 0.9) return 'Excellent'
    if (score >= 0.7) return 'Good'
    if (score >= 0.5) return 'Fair'
    return 'Poor'
  }
}
