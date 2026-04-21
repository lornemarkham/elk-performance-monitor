import type {
  SessionMetrics,
  SloDefinition,
  SloEvaluationOutcome,
  SloEvaluationRow,
  SloOperator,
  SloOverallStatus,
  SloResultStatus,
  SloAudience,
} from './types'

function compare(actual: number, op: SloOperator, threshold: number): boolean {
  switch (op) {
    case '>=':
      return actual >= threshold
    case '<=':
      return actual <= threshold
    case '>':
      return actual > threshold
    case '<':
      return actual < threshold
    default:
      return false
  }
}

function formatPercent(p: number): string {
  return `${p.toFixed(2)}%`
}

function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`
}

function metricForSlo(
  def: SloDefinition,
  m: SessionMetrics,
): { value: number | null; insufficient: boolean; display: string } {
  switch (def.metricType) {
    case 'success_rate': {
      if (m.totalApiRequests === 0) {
        return { value: null, insufficient: true, display: '—' }
      }
      const v = m.apiSuccessRatePercent
      return {
        value: v,
        insufficient: false,
        display: v == null ? '—' : formatPercent(v),
      }
    }
    case 'error_rate': {
      if (m.totalApiRequests === 0) {
        return { value: null, insufficient: true, display: '—' }
      }
      const v = m.apiErrorRatePercent
      return {
        value: v,
        insufficient: false,
        display: v == null ? '—' : formatPercent(v),
      }
    }
    case 'status_code_rate': {
      if (def.statusCode !== 401) {
        return { value: null, insufficient: true, display: '—' }
      }
      if (m.totalApiRequests === 0) {
        return { value: null, insufficient: true, display: '—' }
      }
      const v = m.unauthorized401RatePercent
      return {
        value: v,
        insufficient: false,
        display: v == null ? '—' : formatPercent(v),
      }
    }
    case 'browser_stability_rate': {
      if (m.browserStabilityRatePercent == null) {
        return { value: null, insufficient: true, display: '—' }
      }
      const v = m.browserStabilityRatePercent
      return { value: v, insufficient: false, display: formatPercent(v) }
    }
    case 'latency_percentile': {
      if (m.apiLatencyP9999Ms == null) {
        return { value: null, insufficient: true, display: '—' }
      }
      return {
        value: m.apiLatencyP9999Ms,
        insufficient: false,
        display: formatMs(m.apiLatencyP9999Ms),
      }
    }
  }
}

function breachMessage(def: SloDefinition, actualDisplay: string, passed: boolean): string | null {
  if (passed) return null
  return `${def.name} breached: actual ${actualDisplay} vs target ${def.targetSummary}.`
}

function rowWithAudience(
  def: SloDefinition,
  m: SessionMetrics,
  audience: SloAudience,
): SloEvaluationRow {
  const { value, insufficient, display } = metricForSlo(def, m)

  if (insufficient || value == null) {
    return {
      definition: def,
      status: 'insufficient_sample',
      actualValue: value,
      actualDisplay: display,
      targetDisplay: def.targetSummary,
      breachReason: 'Not enough data in this capture to evaluate this SLO precisely.',
      audienceLine: def.audienceImpact[audience],
    }
  }

  const passed = compare(value, def.operator, def.threshold)
  const status: SloResultStatus = passed ? 'pass' : 'fail'

  return {
    definition: def,
    status,
    actualValue: value,
    actualDisplay: display,
    targetDisplay: def.targetSummary,
    breachReason: breachMessage(def, display, passed),
    audienceLine: def.audienceImpact[audience],
  }
}

function overallFromResults(results: SloEvaluationRow[]): SloOverallStatus {
  const failedCritical = results.some(
    (r) => r.status === 'fail' && r.definition.severityOnBreach === 'critical',
  )
  const failedWarn = results.some(
    (r) => r.status === 'fail' && r.definition.severityOnBreach === 'warning',
  )
  const insufficient = results.some((r) => r.status === 'insufficient_sample')

  if (failedCritical) return 'critical'
  if (failedWarn) return 'warning'
  if (insufficient) return 'warning'
  return 'healthy'
}

export function evaluateSlos(
  definitions: SloDefinition[],
  metrics: SessionMetrics,
  audience: SloAudience,
): SloEvaluationOutcome {
  const results = definitions.map((d) => rowWithAudience(d, metrics, audience))
  const overall = overallFromResults(results)
  const sessionNote =
    metrics.sampleNotes.length > 0 ? metrics.sampleNotes.join(' ') : undefined
  return { overall, results, sessionNote }
}
