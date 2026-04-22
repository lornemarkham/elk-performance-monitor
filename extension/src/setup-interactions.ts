import type { UserInteractionPayload } from './core/bridge-protocol'
import { PAGE_BRIDGE_CHANNEL, PROTOCOL_VERSION } from './core/bridge-protocol'

let interactionSeq = 0
function nextInteractionId(): string {
  interactionSeq += 1
  return `int-${Date.now().toString(36)}-${interactionSeq}`
}

function getElementSelector(el: Element): string {
  if (el.id) return `#${el.id}`
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).slice(0, 3).join('.')
    if (classes) return `${el.tagName.toLowerCase()}.${classes}`
  }
  return el.tagName.toLowerCase()
}

function getElementText(el: Element): string | undefined {
  const text = el.textContent?.trim()
  if (!text || text.length === 0) return undefined
  return text.length > 50 ? `${text.slice(0, 47)}...` : text
}

function getFrameContext() {
  const isTop = window === window.top
  return {
    frameType: (isTop ? 'top' : 'iframe') as 'top' | 'iframe',
    frameUrl: window.location.href,
  }
}

function captureInteraction(
  interactionType: UserInteractionPayload['interactionType'],
  target: Element,
  context?: Record<string, unknown>,
): void {
  const payload: UserInteractionPayload = {
    type: 'interaction',
    id: nextInteractionId(),
    interactionType,
    target: getElementSelector(target),
    targetText: getElementText(target),
    timestamp: Date.now(),
    context,
    ...getFrameContext(),
  }

  window.postMessage(
    {
      channel: PAGE_BRIDGE_CHANNEL,
      v: PROTOCOL_VERSION,
      kind: 'interaction',
      payload,
    },
    '*',
  )
}

/**
 * Sets up user interaction tracking in the page context.
 * Captures clicks, form submissions, and key interactions.
 */
export function setupInteractionTracking(debug?: boolean): void {
  if (debug) {
    console.log('[ELK Monitor] Setting up interaction tracking')
  }

  // Track clicks
  document.addEventListener(
    'click',
    (ev) => {
      const target = ev.target
      if (!(target instanceof Element)) return

      const context: Record<string, unknown> = {}
      
      // Capture button/link context
      if (target instanceof HTMLButtonElement) {
        context.buttonType = target.type
        context.disabled = target.disabled
      } else if (target instanceof HTMLAnchorElement) {
        context.href = target.href
      }

      captureInteraction('click', target, context)
    },
    { capture: true, passive: true },
  )

  // Track form submissions
  document.addEventListener(
    'submit',
    (ev) => {
      const target = ev.target
      if (!(target instanceof HTMLFormElement)) return

      const context: Record<string, unknown> = {
        action: target.action,
        method: target.method,
      }

      captureInteraction('submit', target, context)
    },
    { capture: true },
  )

  // Track input changes (debounced)
  let inputTimeout: ReturnType<typeof setTimeout> | null = null
  document.addEventListener(
    'input',
    (ev) => {
      const target = ev.target
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return

      // Debounce input events
      if (inputTimeout) clearTimeout(inputTimeout)
      inputTimeout = setTimeout(() => {
        const context: Record<string, unknown> = {
          inputType: target instanceof HTMLInputElement ? target.type : 'textarea',
          name: target.name,
        }

        captureInteraction('input', target, context)
      }, 500)
    },
    { capture: true, passive: true },
  )

  // Track focus events (for form field tracking)
  document.addEventListener(
    'focus',
    (ev) => {
      const target = ev.target
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return

      const context: Record<string, unknown> = {
        inputType: target instanceof HTMLInputElement ? target.type : 'textarea',
        name: target.name,
      }

      captureInteraction('focus', target, context)
    },
    { capture: true, passive: true },
  )

  // Track scroll (throttled)
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null
  let lastScrollY = window.scrollY
  window.addEventListener(
    'scroll',
    () => {
      if (scrollTimeout) return
      scrollTimeout = setTimeout(() => {
        const currentScrollY = window.scrollY
        const delta = currentScrollY - lastScrollY
        lastScrollY = currentScrollY

        const context: Record<string, unknown> = {
          scrollY: currentScrollY,
          delta,
          direction: delta > 0 ? 'down' : 'up',
        }

        captureInteraction('scroll', document.documentElement, context)
        scrollTimeout = null
      }, 300)
    },
    { passive: true },
  )
}
