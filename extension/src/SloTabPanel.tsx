import type { SessionMetrics, SloEvaluationOutcome, SloEvaluationRow } from './slo/types'
import { useCallback, useState } from 'react'

type Props = {
  outcome: SloEvaluationOutcome
  metrics: SessionMetrics
}

function supportingLine(row: SloEvaluationRow, m: SessionMetrics): string {
  switch (row.definition.metricType) {
    case 'success_rate':
    case 'error_rate':
    case 'status_code_rate':
      return `API samples in capture: ${m.totalApiRequests} completed calls.`
    case 'browser_stability_rate':
      return `Flows: ${m.completeFlowCount} complete, ${m.failedFlowCount} failed, ${m.pageErrorCount} page errors.`
    case 'latency_percentile':
      return `Latency sample: ${m.apiDurationsMs.length} durations; p99.99 needs ≥200 samples.`
    default:
      return ''
  }
}

export function SloTabPanel({ outcome, metrics }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  return (
    <div className="elk-perf-slo-tab" aria-label="Eleos SLO evaluation">
      {outcome.sessionNote ? (
        <p className="elk-perf-slo-tab-note">{outcome.sessionNote}</p>
      ) : null}

      <ul className="elk-perf-slo-accordion">
        {outcome.results.map((row) => {
          const isOpen = expanded[row.definition.id] === true
          return (
            <li
              key={row.definition.id}
              className={`elk-perf-slo-acc-item elk-perf-slo-acc-item--${row.status}`}
            >
              <button
                type="button"
                className="elk-perf-slo-acc-header"
                aria-expanded={isOpen}
                onClick={() => toggle(row.definition.id)}
              >
                <span className="elk-perf-slo-acc-name">{row.definition.name}</span>
                <span className="elk-perf-slo-acc-metrics">
                  {row.actualDisplay} / {row.targetDisplay}
                </span>
                <span className={`elk-perf-slo-pill elk-perf-slo-pill--${row.status}`}>
                  {row.status === 'pass'
                    ? 'PASS'
                    : row.status === 'fail'
                      ? 'FAIL'
                      : 'LIMITED SAMPLE'}
                </span>
                <span className="elk-perf-slo-acc-chevron" aria-hidden>
                  {isOpen ? '▾' : '▸'}
                </span>
              </button>
              {isOpen ? (
                <div className="elk-perf-slo-acc-body">
                  <div className="elk-perf-slo-acc-subhd">Explanation (current audience)</div>
                  <p className="elk-perf-slo-acc-impact">{row.audienceLine}</p>
                  <div className="elk-perf-slo-acc-subhd">Technical</div>
                  <p className="elk-perf-slo-acc-tech">{row.definition.description}</p>
                  {row.breachReason ? (
                    <p className="elk-perf-slo-acc-breach">{row.breachReason}</p>
                  ) : null}
                  <div className="elk-perf-slo-acc-subhd">Business</div>
                  <p className="elk-perf-slo-acc-biz">{row.definition.audienceImpact.business}</p>
                  <div className="elk-perf-slo-acc-subhd">Supporting data</div>
                  <p className="elk-perf-slo-acc-support">{supportingLine(row, metrics)}</p>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
