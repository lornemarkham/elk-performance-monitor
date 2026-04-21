/**
 * Injects `page-world.js` exactly once per document using DOM-safe APIs only
 * (`createElement`, `setAttribute`, `appendChild` — no `innerHTML`, no inline script text).
 *
 * Uses a short-lived `data-elk-perf-page-world-pending` marker on `<html>` so a duplicate
 * injection cannot start while the script is loading; `error` / `load` clear it.
 */
const SCRIPT_MARK = 'data-elk-perf-page-world'
const PENDING_MARK = 'data-elk-perf-page-world-pending'

let injectInvokedFromContentScript = false

export function injectPageWorldScript(): void {
  if (typeof chrome?.runtime?.getURL !== 'function') return

  const root = document.documentElement
  if (!root) return

  if (document.querySelector(`script[${SCRIPT_MARK}]`)) return
  if (root.hasAttribute(PENDING_MARK)) return
  if (injectInvokedFromContentScript) return

  injectInvokedFromContentScript = true
  root.setAttribute(PENDING_MARK, '')

  const src = chrome.runtime.getURL('page-world.js')
  const script = document.createElement('script')
  script.src = src
  script.async = false
  script.setAttribute(SCRIPT_MARK, '1')
  /** Extension URL only; avoids leaking document URL as referrer if the browser would send one. */
  script.referrerPolicy = 'no-referrer'

  const clearPending = (): void => {
    root.removeAttribute(PENDING_MARK)
  }

  script.addEventListener(
    'load',
    () => {
      clearPending()
    },
    { once: true },
  )

  script.addEventListener(
    'error',
    () => {
      clearPending()
      script.remove()
      injectInvokedFromContentScript = false
    },
    { once: true },
  )

  try {
    root.appendChild(script)
  } catch {
    clearPending()
    injectInvokedFromContentScript = false
  }
}
