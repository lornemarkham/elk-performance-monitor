/**
 * Runs in the **page** JavaScript world (not the extension content-script isolate).
 * Patches fetch / XHR and listens for global errors; posts results to the content script via window.postMessage.
 */
import { classifyRequest } from './classify-request'
import {
  PAGE_BRIDGE_CHANNEL,
  PROTOCOL_VERSION,
  type ErrorPayload,
  type RequestPayload,
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
}

install()
