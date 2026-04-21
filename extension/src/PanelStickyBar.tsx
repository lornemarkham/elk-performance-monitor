import type { SloAudience } from './slo/types'

export type CombinedHealthUi = 'healthy' | 'warning' | 'critical'

const AUDIENCE_OPTIONS: { id: SloAudience; label: string }[] = [
  { id: 'developer', label: 'Developer' },
  { id: 'product', label: 'Product' },
  { id: 'business', label: 'Business' },
]

type Props = {
  combinedHealth: CombinedHealthUi
  appName: string
  sessionLine: string
  failedSloNames: string[]
  audience: SloAudience
  onAudienceChange: (a: SloAudience) => void
}

export function PanelStickyBar({
  combinedHealth,
  appName,
  sessionLine,
  failedSloNames,
  audience,
  onAudienceChange,
}: Props) {
  const failedLabel =
    failedSloNames.length === 0
      ? 'No SLO failures'
      : failedSloNames.length <= 2
        ? failedSloNames.join(' · ')
        : `${failedSloNames.slice(0, 2).join(' · ')} +${failedSloNames.length - 2}`

  return (
    <div className="elk-perf-cmd-bar">
      <div className="elk-perf-cmd-bar-row elk-perf-cmd-bar-row--primary">
        <div
          className={`elk-perf-cmd-health elk-perf-cmd-health--${combinedHealth}`}
          title="Combined session + Eleos SLO status"
        >
          {combinedHealth === 'healthy' ? 'Healthy' : combinedHealth === 'warning' ? 'Warning' : 'Critical'}
        </div>
        <div className="elk-perf-cmd-app">{appName}</div>
        <div className="elk-perf-cmd-session" title={sessionLine}>
          {sessionLine}
        </div>
      </div>
      <div className="elk-perf-cmd-bar-row elk-perf-cmd-bar-row--secondary">
        <div className="elk-perf-cmd-failed" title={failedSloNames.join(', ') || undefined}>
          <span className="elk-perf-cmd-failed-label">SLO:</span> {failedLabel}
        </div>
        <div
          className="elk-perf-cmd-audience"
          role="group"
          aria-label="Explanation audience"
        >
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`elk-perf-chip elk-perf-cmd-audience-chip${
                audience === opt.id ? ' elk-perf-chip--on' : ''
              }`}
              onClick={() => onAudienceChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
