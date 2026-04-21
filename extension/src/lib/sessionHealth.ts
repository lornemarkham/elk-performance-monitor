import type { SessionSignals } from './aiExplain'

export type SessionHealth = {
  status: 'healthy' | 'degraded' | 'critical'
  score: number
  reasons: string[]
}

export function computeSessionHealth(signals: SessionSignals): SessionHealth {
  let score = 100
  const reasons: string[] = []

  if (signals.failed401 > 0) {
    score -= 30
    reasons.push('Unauthorized (401) errors detected')
  }
  if (signals.failedOther > 0) {
    score -= 20
  }
  if (signals.anyFailedRequest) {
    score -= 10
    reasons.push('API request failures detected')
  }
  if (signals.pageErrors > 0) {
    score -= 25
    reasons.push('Page errors occurred')
  }
  if (signals.failedFlows > 0) {
    score -= 15
    reasons.push('Incomplete or failed flows detected')
  }

  score = Math.max(0, Math.min(100, score))

  const status: SessionHealth['status'] =
    score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical'

  return { status, score, reasons }
}
