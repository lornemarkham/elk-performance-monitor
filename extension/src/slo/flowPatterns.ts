/** Timeline row shape for flow detection (oldest → newest). */
export type FlowTimelineKind = 'request' | 'error' | 'message'

export type FlowTimelineRow = {
  kind: FlowTimelineKind
  sortKey: number
}

/**
 * Greedy scan: message → request → message = complete; message → request → error = failed.
 * Mirrors InstrumentationBody timeline logic.
 */
export function scanFlowPatterns(chrono: FlowTimelineRow[]): { complete: number; failed: number } {
  let complete = 0
  let failed = 0
  let i = 0
  while (i < chrono.length) {
    if (chrono[i].kind !== 'message') {
      i++
      continue
    }
    let j = i + 1
    while (j < chrono.length && chrono[j].kind !== 'request') j++
    if (j >= chrono.length) {
      i++
      continue
    }
    let k = j + 1
    while (k < chrono.length && chrono[k].kind !== 'message' && chrono[k].kind !== 'error') {
      k++
    }
    if (k >= chrono.length) {
      i++
      continue
    }
    if (chrono[k].kind === 'message') complete++
    else failed++
    i = k + 1
  }
  return { complete, failed }
}
