import { useInstrumentation } from './core/instrumentation-store'
import { JourneyAnalyzer, categorizeRequest, type RequestCategory } from './lib/journey-analyzer'
import { NarrativeGenerator } from './lib/narrative-generator'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

const CATEGORY_ORDER: RequestCategory[] = [
  'Final Submission',
  'Internal Save',
  'Contact Save',
  'External Integration',
  'UI Refresh',
  'Analytics',
  'Other',
]

const CATEGORY_COLOR: Record<RequestCategory, string> = {
  'Final Submission': '#f472b6',
  'Internal Save': '#a78bfa',
  'Contact Save': '#60a5fa',
  'External Integration': '#fb923c',
  'UI Refresh': '#34d399',
  'Analytics': '#64748b',
  'Other': '#94a3b8',
}

/** Upper bound used to suppress implausibly large derived durations (5 minutes). */
const MAX_PLAUSIBLE_DURATION_MS = 5 * 60 * 1000

/**
 * Format a duration safely for display.
 * Returns null when the value is missing, invalid, negative, or implausibly large.
 */
function formatDurationSafe(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null
  if (!Number.isFinite(ms)) return null
  if (ms < 0) return '0ms'
  if (ms > MAX_PLAUSIBLE_DURATION_MS) return null
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function JourneyTab() {
  const data = useInstrumentation()
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  const analysis = useMemo(() => {
    return JourneyAnalyzer.analyzeJourney(
      data.requests,
      data.errors,
      data.interactions,
      data.interframeMessages,
      data.milestones,
      data.navigations,
    )
  }, [data.requests, data.errors, data.interactions, data.interframeMessages, data.milestones, data.navigations])

  const metrics = useMemo(() => {
    return JourneyAnalyzer.calculateMetrics(analysis.steps, data.requests, data.errors)
  }, [analysis.steps, data.requests, data.errors])

  const healthLabel = JourneyAnalyzer.getSessionHealthLabel(metrics)

  // Filter out system/startup milestones to show only workflow-relevant steps
  const workflowSteps = useMemo(() => {
    const systemMilestones = new Set([
      'script_loaded',
      'dom_ready',
      'page_loaded',
      'iframes_detected',
      'first_interaction',
    ])
    
    return analysis.steps.filter((step) => {
      // Hide steps that carry no meaningful signal (defensive — avoids empty cards)
      const hasSignal =
        (step.requests?.length ?? 0) > 0 ||
        (step.interactions?.length ?? 0) > 0 ||
        (step.errors?.length ?? 0) > 0 ||
        (step.milestones?.length ?? 0) > 0
      if (!hasSignal) return false

      // Keep steps that don't have milestones (interactions, errors)
      if (step.milestones.length === 0) return true

      // Filter out system milestones
      const milestoneName = step.milestones[0]?.name
      return !systemMilestones.has(milestoneName)
    })
  }, [analysis.steps])

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
  }

  if (workflowSteps.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#71717a' }}>
        <p>No workflow events captured yet.</p>
        <p style={{ fontSize: '13px', marginTop: '8px' }}>
          Interact with the page to trigger workflow events.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', maxHeight: '100%', overflowY: 'auto' }}>
      {/* KPI Dashboard */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f1f5f9' }}>SESSION HEALTH</h3>
          <span
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: healthLabel === 'Excellent' ? '#10b981' : healthLabel === 'Good' ? '#3b82f6' : healthLabel === 'Fair' ? '#f59e0b' : '#ef4444',
            }}
          >
            {healthLabel} {healthLabel === 'Excellent' && '✓'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
          <div>
            <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Time to Complete</div>
            <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>
              {metrics.timeToComplete < 1000
                ? `${Math.round(metrics.timeToComplete)}ms`
                : `${(metrics.timeToComplete / 1000).toFixed(1)}s`}
            </div>
          </div>

          <div>
            <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Steps Completed</div>
            <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>
              {metrics.stepsCompleted}/{metrics.totalSteps} ({Math.round(metrics.completionRate)}%)
            </div>
          </div>

          <div>
            <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Errors</div>
            <div
              style={{
                color: metrics.errorCount === 0 ? '#10b981' : '#ef4444',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              {metrics.errorCount}
            </div>
          </div>

          <div>
            <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Cache Hit Rate</div>
            <div
              style={{
                color: metrics.cacheHitRate > 70 ? '#10b981' : metrics.cacheHitRate > 40 ? '#f59e0b' : '#ef4444',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              {Math.round(metrics.cacheHitRate)}%
            </div>
          </div>

          <div>
            <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Server Calls</div>
            <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>{metrics.serverCalls}</div>
          </div>

          <div>
            <div style={{ color: '#94a3b8', marginBottom: '4px' }}>User Wait Time</div>
            <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>
              {metrics.userWaitTime < 1000
                ? `${Math.round(metrics.userWaitTime)}ms`
                : `${(metrics.userWaitTime / 1000).toFixed(1)}s`}
            </div>
          </div>
        </div>
      </div>

      {/* Ambient (repeated background polling) */}
      {(analysis.ambientActivity?.patterns?.length ?? 0) > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ambient
          </h3>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontStyle: 'italic' }}>
            Background activity not driven by the user
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
            Background activity detected ({analysis.ambientActivity.totalCalls} calls across {analysis.ambientActivity.patterns.length} pattern{analysis.ambientActivity.patterns.length === 1 ? '' : 's'}).
          </div>
          <div
            style={{
              background: '#1e293b',
              border: '1px dashed #475569',
              borderRadius: '6px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {(analysis.ambientActivity?.patterns ?? []).map((p) => {
              const spanSec = Math.round(p.totalSpanMs / 1000)
              const spanLabel =
                spanSec < 60
                  ? `${spanSec}s`
                  : `${Math.floor(spanSec / 60)}m ${spanSec % 60}s`
              const avgLabel =
                p.avgDurationMs < 1000
                  ? `${Math.round(p.avgDurationMs)}ms`
                  : `${(p.avgDurationMs / 1000).toFixed(1)}s`
              const medLabel =
                p.medianDurationMs < 1000
                  ? `${Math.round(p.medianDurationMs)}ms`
                  : `${(p.medianDurationMs / 1000).toFixed(1)}s`
              return (
                <div key={`${p.method}-${p.normalizedPath}-${p.frameType}`}>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: '12px',
                      color: '#cbd5e1',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ color: '#60a5fa', fontWeight: 600 }}>{p.method}</span>
                    <span style={{ wordBreak: 'break-all' }}>{p.normalizedPath}</span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{p.count} calls</span>
                    <span style={{ color: '#64748b' }}>
                      {p.frameType === 'iframe' ? 'iframe' : 'parent'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', paddingLeft: '2px' }}>
                    Avg {avgLabel} · median {medLabel} · active for {spanLabel}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Journey */}
      <div>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Journey
        </h3>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px', fontStyle: 'italic' }}>
          What happened when the user took action
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {workflowSteps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.id)
            const narrative = NarrativeGenerator.generateStepNarrative(step)
            const performanceExplanation = NarrativeGenerator.generatePerformanceExplanation(step)
            const optimization = NarrativeGenerator.generateOptimizationSuggestion(step)

            return (
              <div
                key={step.id}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                {/* Step Header */}
                <div
                  style={{
                    padding: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                  onClick={() => toggleStep(step.id)}
                >
                  {/* Status Icon */}
                  <div style={{ flexShrink: 0, marginTop: '2px' }}>
                    {step.status === 'success' && <CheckCircle size={18} color="#10b981" />}
                    {step.status === 'error' && <XCircle size={18} color="#ef4444" />}
                    {step.status === 'slow' && <AlertCircle size={18} color="#f59e0b" />}
                  </div>

                  {/* Step Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                        {index + 1}. {step.name}
                      </span>
                      {step.nextJsContext && (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: '#334155',
                            color: '#94a3b8',
                            textTransform: 'uppercase',
                            fontWeight: 500,
                          }}
                        >
                          {step.nextJsContext.renderingStrategy === 'ssg' && 'Static'}
                          {step.nextJsContext.renderingStrategy === 'ssr' && 'SSR'}
                          {step.nextJsContext.renderingStrategy === 'csr' && 'Client'}
                          {step.nextJsContext.renderingStrategy === 'isr' && 'ISR'}
                        </span>
                      )}
                      {step.nextJsContext?.wasCached && (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: '#10b98120',
                            color: '#10b981',
                            fontWeight: 500,
                          }}
                        >
                          Cached
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>{narrative}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748b' }}>
                      {(() => {
                        const label = formatDurationSafe(step.duration)
                        if (!label) return null
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} />
                            {label}
                          </div>
                        )
                      })()}
                      {step.frameType && (
                        <div style={{ fontSize: '11px', color: '#475569' }}>
                          {step.frameType === 'top' ? 'Parent' : 'Iframe'}
                        </div>
                      )}
                      {step.requests.length > 1 && (
                        <div style={{ fontSize: '11px', color: '#60a5fa' }}>
                          {step.requests.length} requests triggered
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div style={{ flexShrink: 0, marginTop: '2px' }}>
                    {isExpanded ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid #334155',
                      padding: '12px',
                      background: '#0f172a',
                      fontSize: '13px',
                    }}
                  >
                    {/* Performance Explanation */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Performance Analysis
                      </div>
                      <div style={{ color: '#cbd5e1' }}>{performanceExplanation}</div>
                    </div>

                    {/* Next.js Details */}
                    {step.nextJsContext && step.nextJsContext.isNextJsApp && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                          Next.js Context
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                          <div>
                            <span style={{ color: '#64748b' }}>Rendering:</span>{' '}
                            <span style={{ color: '#e2e8f0' }}>{step.nextJsContext.renderingStrategy.toUpperCase()}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Cache:</span>{' '}
                            <span style={{ color: step.nextJsContext.wasCached ? '#10b981' : '#94a3b8' }}>
                              {step.nextJsContext.cacheStatus}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Request Type:</span>{' '}
                            <span style={{ color: '#e2e8f0' }}>{step.nextJsContext.requestType}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Server-Side:</span>{' '}
                            <span style={{ color: '#e2e8f0' }}>{step.nextJsContext.wasServerRendered ? 'Yes' : 'No'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Optimization Suggestion */}
                    {optimization && (
                      <div
                        style={{
                          padding: '8px',
                          background: '#3b82f620',
                          border: '1px solid #3b82f640',
                          borderRadius: '4px',
                          marginBottom: '12px',
                        }}
                      >
                        <div style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                          💡 OPTIMIZATION SUGGESTION
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '12px' }}>{optimization}</div>
                      </div>
                    )}

                    {/* Submit Referral Workflow Breakdown */}
                    {step.workflowType === 'submit-referral' && step.requests.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                          Workflow Breakdown
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(() => {
                            const grouped = new Map<RequestCategory, typeof step.requests>()
                            step.requests.forEach((r) => {
                              const cat = categorizeRequest(r)
                              const arr = grouped.get(cat) ?? []
                              arr.push(r)
                              grouped.set(cat, arr)
                            })
                            return CATEGORY_ORDER.filter((c) => grouped.has(c)).map((cat) => {
                              const reqs = grouped.get(cat)!
                              const isFinalSubmission = cat === 'Final Submission'
                              const isAnalytics = cat === 'Analytics'

                              // Collapse Analytics: show de-emphasized summary only; full detail is in Network Requests below
                              if (isAnalytics) {
                                return (
                                  <div
                                    key={cat}
                                    style={{
                                      fontSize: '11px',
                                      color: CATEGORY_COLOR[cat],
                                      opacity: 0.65,
                                      fontStyle: 'italic',
                                      paddingLeft: '4px',
                                    }}
                                  >
                                    {cat}: {reqs.length} request{reqs.length === 1 ? '' : 's'} (collapsed — see Network Requests below)
                                  </div>
                                )
                              }

                              return (
                                <div
                                  key={cat}
                                  style={
                                    isFinalSubmission
                                      ? {
                                          padding: '8px',
                                          background: `${CATEGORY_COLOR[cat]}15`,
                                          border: `1px solid ${CATEGORY_COLOR[cat]}50`,
                                          borderRadius: '4px',
                                        }
                                      : undefined
                                  }
                                >
                                  <div
                                    style={{
                                      fontSize: isFinalSubmission ? '12px' : '11px',
                                      fontWeight: 700,
                                      color: CATEGORY_COLOR[cat],
                                      textTransform: 'uppercase',
                                      letterSpacing: isFinalSubmission ? '0.5px' : 'normal',
                                      marginBottom: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    {isFinalSubmission && <span>★</span>}
                                    {cat}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '10px', borderLeft: `2px solid ${CATEGORY_COLOR[cat]}40` }}>
                                    {reqs.map((req) => {
                                      const statusOk = req.success
                                      const statusColor = statusOk ? '#10b981' : '#ef4444'
                                      const durationLabel =
                                        req.durationMs < 1000
                                          ? `${Math.round(req.durationMs)}ms`
                                          : `${(req.durationMs / 1000).toFixed(1)}s`
                                      let path = req.url
                                      try {
                                        path = new URL(req.url).pathname
                                      } catch {
                                        /* keep original */
                                      }
                                      return (
                                        <div
                                          key={req.id}
                                          style={{
                                            fontSize: isFinalSubmission ? '13px' : '12px',
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                            color: '#cbd5e1',
                                            fontWeight: isFinalSubmission ? 600 : 400,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            flexWrap: 'wrap',
                                          }}
                                        >
                                          <span style={{ color: '#60a5fa', fontWeight: 600 }}>{req.method}</span>
                                          <span style={{ wordBreak: 'break-all' }}>{path}</span>
                                          <span style={{ color: statusColor, fontWeight: 600 }}>
                                            ({req.status ?? 'failed'}, {durationLabel})
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '8px',
                            borderRadius: '4px',
                            background: step.status === 'error' ? '#ef444420' : '#10b98120',
                            border: `1px solid ${step.status === 'error' ? '#ef444440' : '#10b98140'}`,
                            color: step.status === 'error' ? '#fca5a5' : '#86efac',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          Final Status:{' '}
                          {step.status === 'error'
                            ? 'Fail (a critical request failed)'
                            : 'Success (all critical requests succeeded)'}
                        </div>
                      </div>
                    )}

                    {/* Request Details */}
                    {step.requests.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                          Network Requests ({step.requests.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {step.requests.map((req) => {
                            const statusOk = req.success
                            const statusColor = statusOk ? '#10b981' : '#ef4444'
                            const durationLabel =
                              req.durationMs < 1000
                                ? `${Math.round(req.durationMs)}ms`
                                : `${(req.durationMs / 1000).toFixed(1)}s`
                            return (
                              <div
                                key={req.id}
                                style={{
                                  padding: '8px',
                                  background: '#1e293b',
                                  border: '1px solid #334155',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>{req.method}</span>
                                  <span style={{ color: statusColor, fontWeight: 600 }}>{req.status ?? 'failed'}</span>
                                  <span style={{ color: '#94a3b8' }}>{durationLabel}</span>
                                  <span style={{ color: '#475569', fontSize: '11px' }}>
                                    {req.source} · {req.frameType === 'iframe' ? 'iframe' : 'parent'}
                                  </span>
                                </div>
                                <div style={{ color: '#cbd5e1', wordBreak: 'break-all' }}>{req.url}</div>
                                {req.error && (
                                  <div style={{ color: '#ef4444', marginTop: '4px' }}>Error: {req.error}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Event Counts */}
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                      {step.interactions.length > 0 && <div>Interactions: {step.interactions.length}</div>}
                      {step.messages.length > 0 && <div>Messages: {step.messages.length}</div>}
                      {step.errors.length > 0 && <div style={{ color: '#ef4444' }}>Errors: {step.errors.length}</div>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Session Summary */}
      <div
        style={{
          marginTop: '20px',
          padding: '12px',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#cbd5e1',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#f1f5f9' }}>Session Summary</div>
        <div>{NarrativeGenerator.generateSessionSummary(metrics)}</div>
      </div>
    </div>
  )
}
