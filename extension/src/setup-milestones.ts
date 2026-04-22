import type { MilestonePayload } from './core/bridge-protocol'
import { PAGE_BRIDGE_CHANNEL, PROTOCOL_VERSION } from './core/bridge-protocol'

let milestoneSeq = 0
let sessionStartTime: number | null = null

function nextMilestoneId(): string {
  milestoneSeq += 1
  return `milestone-${Date.now().toString(36)}-${milestoneSeq}`
}

function getFrameContext() {
  const isTop = window === window.top
  return {
    frameType: (isTop ? 'top' : 'iframe') as 'top' | 'iframe',
    frameUrl: window.location.href,
  }
}

export function emitMilestone(
  name: string,
  description: string,
  metadata?: Record<string, unknown>,
): void {
  const now = Date.now()
  
  if (sessionStartTime === null) {
    sessionStartTime = now
  }

  const payload: MilestonePayload = {
    type: 'milestone',
    id: nextMilestoneId(),
    name,
    description,
    timestamp: now,
    durationFromStart: now - sessionStartTime,
    metadata,
    ...getFrameContext(),
  }

  window.postMessage(
    {
      channel: PAGE_BRIDGE_CHANNEL,
      v: PROTOCOL_VERSION,
      kind: 'milestone',
      payload,
    },
    '*',
  )
}

/**
 * Sets up automatic milestone tracking for common page lifecycle events.
 */
export function setupMilestoneTracking(debug?: boolean): void {
  if (debug) {
    console.log('[ELK Monitor] Setting up milestone tracking')
  }

  const isTop = window === window.top

  // Milestone: Script loaded
  emitMilestone(
    'script_loaded',
    isTop ? 'Performance monitor script loaded (top frame)' : 'Performance monitor script loaded (iframe)',
    { frameType: isTop ? 'top' : 'iframe' },
  )

  // Milestone: DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      emitMilestone(
        'dom_ready',
        isTop ? 'DOM content loaded (top frame)' : 'DOM content loaded (iframe)',
        { readyState: document.readyState },
      )
    })
  } else {
    emitMilestone(
      'dom_ready',
      isTop ? 'DOM content loaded (top frame)' : 'DOM content loaded (iframe)',
      { readyState: document.readyState, immediate: true },
    )
  }

  // Milestone: Page fully loaded
  if (document.readyState === 'complete') {
    emitMilestone(
      'page_loaded',
      isTop ? 'Page fully loaded (top frame)' : 'Page fully loaded (iframe)',
      { readyState: document.readyState, immediate: true },
    )
  } else {
    window.addEventListener('load', () => {
      emitMilestone(
        'page_loaded',
        isTop ? 'Page fully loaded (top frame)' : 'Page fully loaded (iframe)',
        { readyState: document.readyState },
      )
    })
  }

  // Milestone: Iframe detection (top frame only)
  if (isTop) {
    const checkIframes = () => {
      const iframes = document.querySelectorAll('iframe')
      if (iframes.length > 0) {
        emitMilestone('iframes_detected', `Detected ${iframes.length} iframe(s) on page`, {
          iframeCount: iframes.length,
          iframeSources: Array.from(iframes)
            .map((iframe) => iframe.src)
            .filter(Boolean)
            .slice(0, 5),
        })
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkIframes)
    } else {
      checkIframes()
    }
  }

  // Milestone: First user interaction
  let firstInteractionCaptured = false
  const captureFirstInteraction = () => {
    if (firstInteractionCaptured) return
    firstInteractionCaptured = true
    emitMilestone('first_interaction', 'User performed first interaction', {
      timeToFirstInteraction: sessionStartTime ? Date.now() - sessionStartTime : undefined,
    })
  }

  document.addEventListener('click', captureFirstInteraction, { once: true, capture: true })
  document.addEventListener('keydown', captureFirstInteraction, { once: true, capture: true })
  document.addEventListener('touchstart', captureFirstInteraction, { once: true, capture: true })
}

/**
 * Emit a custom milestone from application code.
 * Useful for tracking app-specific events like "form_submitted", "api_call_completed", etc.
 */
export function trackMilestone(name: string, description: string, metadata?: Record<string, unknown>): void {
  emitMilestone(name, description, metadata)
}
