import { Activity, ChevronLeft, Minus, X } from 'lucide-react'
import { useCallback } from 'react'
import { InstrumentationBody } from './InstrumentationBody'

export type PanelMode = 'open' | 'minimized' | 'closed'

type Props = {
  mode: PanelMode
  onModeChange: (mode: PanelMode) => void
}

export function ExtensionPanel({ mode, onModeChange }: Props) {
  const minimize = useCallback(() => onModeChange('minimized'), [onModeChange])
  const close = useCallback(() => onModeChange('closed'), [onModeChange])

  if (mode === 'closed') {
    return (
      <button
        type="button"
        className="elk-perf-fab"
        aria-label="Open performance monitor"
        title="Open performance monitor"
        onClick={() => onModeChange('open')}
      >
        <Activity size={22} strokeWidth={2} aria-hidden />
      </button>
    )
  }

  const minimized = mode === 'minimized'

  return (
    <div className={`elk-perf-panel-dock${minimized ? ' elk-perf-panel-dock--min' : ''}`}>
      <header className="elk-perf-panel-header">
        <div className="elk-perf-title-block">
          <h1 className="elk-perf-title">Performance monitor</h1>
          <p className="elk-perf-sub">Chrome extension · Phase 2 instrumentation</p>
        </div>
        <div className="elk-perf-header-actions">
          {!minimized ? (
            <button
              type="button"
              className="elk-perf-icon-btn"
              aria-label="Minimize panel"
              title="Minimize"
              onClick={minimize}
            >
              <Minus size={18} strokeWidth={2} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="elk-perf-icon-btn"
              aria-label="Expand panel"
              title="Expand"
              onClick={() => onModeChange('open')}
            >
              <ChevronLeft size={18} strokeWidth={2} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="elk-perf-icon-btn elk-perf-icon-btn--danger"
            aria-label="Close panel"
            title="Close"
            onClick={close}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </header>
      {!minimized ? (
        <div className="elk-perf-panel-body">
          <InstrumentationBody />
        </div>
      ) : null}
    </div>
  )
}
