/**
 * Runs in the **page** JavaScript world (not the extension content-script isolate).
 * Patches fetch / XHR and listens for global errors; posts results to the content script via window.postMessage.
 */
import { classifyRequest } from './classify-request'
import {
  PAGE_BRIDGE_CHANNEL,
  PROTOCOL_VERSION,
  type ErrorPayload,
  type MilestonePayload,
  type RequestPayload,
  type UserInteractionPayload,
} from './core/bridge-protocol'

declare global {
  interface Window {
    __elkPerfPageInstrumented?: boolean
  }
}

function postRequest(payload: RequestPayload): void {
  window.postMessage(
    {
      channel: PAGE_BRIDGE_CHANNEL,
      v: PROTOCOL_VERSION,
      kind: 'request',
      payload,
    },
    '*',
  )
}

function postError(payload: ErrorPayload): void {
  window.postMessage(
    {
      channel: PAGE_BRIDGE_CHANNEL,
      v: PROTOCOL_VERSION,
      kind: 'error',
      payload,
    },
    '*',
  )
}

function postInteraction(payload: UserInteractionPayload): void {
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

function postMilestone(payload: MilestonePayload): void {
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

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

function resolveUrl(input: RequestInfo | URL, init?: RequestInit): string {
  try {
    if (typeof input === 'string') return new URL(input, window.location.href).href
    if (input instanceof URL) return input.href
    if (input instanceof Request) return input.url
  } catch {
    /* ignore */
  }
  return String(input)
}

function methodFromFetchInput(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return String(init.method).toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
  return 'GET'
}

function buildRequestPayload(
  partial: Omit<RequestPayload, 'requestKind' | 'startTime' | 'endTime' | 'durationMs'> & {
    startTime: number
    endTime: number
  },
): RequestPayload {
  const durationMs = Math.max(0, Math.round(partial.endTime - partial.startTime))
  return {
    ...partial,
    durationMs,
    requestKind: classifyRequest(partial.url),
  }
}

function getFrameContext() {
  const isTop = window === window.top
  return {
    frameType: (isTop ? 'top' : 'iframe') as 'top' | 'iframe',
    frameUrl: window.location.href,
  }
}

/** Walk up from `el` to find the nearest interactive/clickable ancestor (inclusive). */
function resolveClickableAncestor(el: Element): Element {
  const SELECTOR =
    'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], input[type="submit"], input[type="button"], input[type="reset"], summary, label[for]'
  const ancestor = el.closest?.(SELECTOR)
  return ancestor ?? el
}

function getElementSelector(el: Element): string {
  if (el.id) return `#${el.id}`
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).slice(0, 3).join('.')
    if (classes) return `${el.tagName.toLowerCase()}.${classes}`
  }
  return el.tagName.toLowerCase()
}

/** Normalize whitespace and truncate for display. */
function normalizeLabel(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > 50 ? `${text.slice(0, 47)}...` : text
}

/**
 * Extract a meaningful label from an element, preferring accessible labels
 * over raw textContent. Falls back through aria-label, title, value, then text.
 */
function getElementText(el: Element): string | undefined {
  const ariaLabel = normalizeLabel(el.getAttribute('aria-label'))
  if (ariaLabel) return ariaLabel

  const title = normalizeLabel(el.getAttribute('title'))
  if (title) return title

  if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
    const value = normalizeLabel(el.value)
    if (value) return value
  }

  const text = normalizeLabel(el.textContent)
  if (text) return text

  const altImg = el.querySelector?.('img[alt]') as HTMLImageElement | null
  if (altImg) {
    const alt = normalizeLabel(altImg.alt)
    if (alt) return alt
  }

  return undefined
}

let sessionStartTime: number | null = null

function emitMilestone(name: string, description: string, metadata?: Record<string, unknown>): void {
  const now = Date.now()
  if (sessionStartTime === null) {
    sessionStartTime = now
  }

  const payload: MilestonePayload = {
    type: 'milestone',
    id: nextId('milestone'),
    name,
    description,
    timestamp: now,
    durationFromStart: now - sessionStartTime,
    metadata,
    ...getFrameContext(),
  }

  postMilestone(payload)
}

/** Ignore DOM events that originate from the extension's own UI container. */
function isExtensionHostEvent(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('#elk-perf-monitor-extension-host') !== null
}

function setupInteractionTracking(): void {
  document.addEventListener(
    'click',
    (ev) => {
      const rawTarget = ev.target
      if (!(rawTarget instanceof Element)) return
      if (isExtensionHostEvent(rawTarget)) return

      // Resolve the nearest clickable ancestor so clicks on nested icons/svgs
      // still yield meaningful button labels (e.g. "Submit referral" not "svg").
      const target = resolveClickableAncestor(rawTarget)

      const context: Record<string, unknown> = {}
      if (target instanceof HTMLButtonElement) {
        context.buttonType = target.type
        context.disabled = target.disabled
      } else if (target instanceof HTMLAnchorElement) {
        context.href = target.href
      }

      const payload: UserInteractionPayload = {
        type: 'interaction',
        id: nextId('int'),
        interactionType: 'click',
        target: getElementSelector(target),
        targetText: getElementText(target),
        timestamp: Date.now(),
        context,
        ...getFrameContext(),
      }

      postInteraction(payload)
    },
    { capture: true, passive: true },
  )

  document.addEventListener(
    'submit',
    (ev) => {
      const target = ev.target
      if (!(target instanceof HTMLFormElement)) return
      if (isExtensionHostEvent(target)) return

      const payload: UserInteractionPayload = {
        type: 'interaction',
        id: nextId('int'),
        interactionType: 'submit',
        target: getElementSelector(target),
        timestamp: Date.now(),
        context: {
          action: target.action,
          method: target.method,
        },
        ...getFrameContext(),
      }

      postInteraction(payload)
    },
    { capture: true },
  )
}

function setupMilestoneTracking(): void {
  const isTop = window === window.top

  emitMilestone(
    'script_loaded',
    isTop ? 'Performance monitor script loaded (top frame)' : 'Performance monitor script loaded (iframe)',
    { frameType: isTop ? 'top' : 'iframe' },
  )

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      emitMilestone('dom_ready', isTop ? 'DOM content loaded (top frame)' : 'DOM content loaded (iframe)', {
        readyState: document.readyState,
      })
    })
  } else {
    emitMilestone('dom_ready', isTop ? 'DOM content loaded (top frame)' : 'DOM content loaded (iframe)', {
      readyState: document.readyState,
      immediate: true,
    })
  }

  if (document.readyState === 'complete') {
    emitMilestone('page_loaded', isTop ? 'Page fully loaded (top frame)' : 'Page fully loaded (iframe)', {
      readyState: document.readyState,
      immediate: true,
    })
  } else {
    window.addEventListener('load', () => {
      emitMilestone('page_loaded', isTop ? 'Page fully loaded (top frame)' : 'Page fully loaded (iframe)', {
        readyState: document.readyState,
      })
    })
  }

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

  let firstInteractionCaptured = false
  const captureFirstInteraction = (ev: Event) => {
    if (firstInteractionCaptured) return
    if (isExtensionHostEvent(ev.target)) return
    firstInteractionCaptured = true
    emitMilestone('first_interaction', 'User performed first interaction', {
      timeToFirstInteraction: sessionStartTime ? Date.now() - sessionStartTime : undefined,
    })
  }

  document.addEventListener('click', captureFirstInteraction, { capture: true })
  document.addEventListener('keydown', captureFirstInteraction, { capture: true })
}

function install(): void {
  if (window.__elkPerfPageInstrumented) return
  window.__elkPerfPageInstrumented = true

  const origFetch = window.fetch.bind(window)
  window.fetch = function elkPerfPatchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = resolveUrl(input, init)
    const method = methodFromFetchInput(input, init)
    const startTime = Date.now()
    return origFetch(input, init).then(
      (res) => {
        const endTime = Date.now()
        const success = res.ok
        postRequest(
          buildRequestPayload({
            id: nextId('fetch'),
            source: 'fetch',
            method,
            url,
            startTime,
            endTime,
            status: res.status,
            success,
            error: null,
          }),
        )
        return res
      },
      (err: unknown) => {
        const endTime = Date.now()
        postRequest(
          buildRequestPayload({
            id: nextId('fetch'),
            source: 'fetch',
            method,
            url,
            startTime,
            endTime,
            status: null,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        throw err
      },
    )
  }

  const XHR = XMLHttpRequest.prototype
  const origOpen = XHR.open
  const origSend = XHR.send

  XHR.open = function elkPerfPatchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
  ): void {
    const self = this as XMLHttpRequest & { __elkMethod?: string; __elkUrl?: string }
    self.__elkMethod = String(method).toUpperCase()
    try {
      self.__elkUrl = typeof url === 'string' ? new URL(url, window.location.href).href : url.href
    } catch {
      self.__elkUrl = String(url)
    }
    return origOpen.apply(this, arguments as unknown as Parameters<typeof origOpen>)
  }

  XHR.send = function elkPerfPatchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as XMLHttpRequest & { __elkMethod?: string; __elkUrl?: string }
    const method = xhr.__elkMethod ?? 'GET'
    const url = xhr.__elkUrl ?? ''
    const startTime = Date.now()

    const onDone = (): void => {
      xhr.removeEventListener('loadend', onDone)
      const endTime = Date.now()
      const status = xhr.status
      const httpOk = status >= 200 && status < 300
      const success = status !== 0 && httpOk
      postRequest(
        buildRequestPayload({
          id: nextId('xhr'),
          source: 'xhr',
          method,
          url,
          startTime,
          endTime,
          status,
          success,
          error: status === 0 ? 'Network or CORS error (status 0)' : null,
        }),
      )
    }

    xhr.addEventListener('loadend', onDone)
    return origSend.call(this, body)
  }

  window.addEventListener(
    'error',
    (ev: ErrorEvent) => {
      const err = ev.error
      const stack = err instanceof Error ? err.stack ?? null : null
      postError({
        id: nextId('err'),
        type: 'runtime-error',
        message: ev.message || 'Error',
        stack,
        timestamp: Date.now(),
      })
    },
    true,
  )

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason = ev.reason
    const message =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : String(reason)
    const stack = reason instanceof Error ? reason.stack ?? null : null
    postError({
      id: nextId('rej'),
      type: 'unhandled-rejection',
      message: message || 'Unhandled rejection',
      stack,
      timestamp: Date.now(),
    })
  })

  setupMilestoneTracking()
  setupInteractionTracking()

  // Expose emitMilestone to window for page scripts to emit semantic journey events
  ;(window as any).__elkMonitor = {
    emitMilestone,
  }
}

install()
