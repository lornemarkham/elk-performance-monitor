/** How the threshold compares to the derived metric (all metrics normalized for comparison). */
export type SloOperator = '>=' | '<=' | '>' | '<'

export type SloMetricType =
  | 'success_rate'
  | 'error_rate'
  | 'latency_percentile'
  | 'status_code_rate'
  | 'browser_stability_rate'

export type SloSeverity = 'warning' | 'critical'

export type SloAudience = 'developer' | 'product' | 'business'

export type SloDefinition = {
  id: string
  name: string
  description: string
  metricType: SloMetricType
  /** Display only, e.g. ">= 99.99%" */
  targetSummary: string
  operator: SloOperator
  /**
   * Rates: 0–100 (percent). Latency: milliseconds.
   * For latency_percentile, compared with operator against measured latency.
   */
  threshold: number
  /** For latency_percentile only (e.g. 0.9999 for p99.99). */
  percentile?: number
  /** For status_code_rate only. */
  statusCode?: number
  severityOnBreach: SloSeverity
  audienceImpact: Record<SloAudience, string>
  scope?: { app: string; service?: string }
}

/** Derived from the current instrumentation snapshot (extension layer). */
export type SessionMetrics = {
  totalApiRequests: number
  successfulApiRequests: number
  failedApiRequests: number
  count401: number
  apiDurationsMs: number[]
  pageErrorCount: number
  completeFlowCount: number
  failedFlowCount: number
  /** 0–100, or null if not computable. */
  apiSuccessRatePercent: number | null
  /** 0–100, or null if not computable. */
  apiErrorRatePercent: number | null
  /** 0–100, or null if not computable. */
  unauthorized401RatePercent: number | null
  /** 0–100 from flow + page error signals, or null. */
  browserStabilityRatePercent: number | null
  /** p99.99 latency ms, or null when sample too small / empty. */
  apiLatencyP9999Ms: number | null
  /** Shown in UI when percentiles or rates are unreliable. */
  sampleNotes: string[]
}

export type SloResultStatus = 'pass' | 'fail' | 'insufficient_sample'

export type SloEvaluationRow = {
  definition: SloDefinition
  status: SloResultStatus
  actualValue: number | null
  actualDisplay: string
  targetDisplay: string
  breachReason: string | null
  audienceLine: string
}

export type SloOverallStatus = 'healthy' | 'warning' | 'critical'

export type SloEvaluationOutcome = {
  overall: SloOverallStatus
  results: SloEvaluationRow[]
  /** Cross-cutting note (e.g. capped list). */
  sessionNote?: string
}
