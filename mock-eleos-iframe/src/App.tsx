import { useCallback, useEffect, useState } from 'react'
import type { ApiOutcome, PatientContextMessage } from './types'
import { isPatientContextMessage } from './types'

const API_BASE = 'http://localhost:4010'

const MODE_PATH: Record<NonNullable<PatientContextMessage['mode']>, string> = {
  success: '/api/evaluate',
  slow: '/api/evaluate-slow',
  unauthorized: '/api/evaluate-401',
  invalid: '/api/evaluate-invalid',
}

function isSevereOrProfound(severity: string): boolean {
  const s = severity.trim().toLowerCase()
  return s === 'severe' || s === 'profound'
}

function computeLocalCandidate(p: PatientContextMessage): boolean {
  return isSevereOrProfound(p.hearingLossSeverity) && p.wordRecognition < 50
}

function mapOutcome(status: number): ApiOutcome {
  if (status === 200) return 'success'
  if (status === 401) return 'unauthorized'
  if (status === 400) return 'validation_error'
  return 'error'
}

function summarizeApiMessage(status: number, json: unknown, rawText: string): string {
  if (json != null && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.message === 'string') return o.message
    if (typeof o.error === 'string') return o.error
  }
  if (rawText.length > 0) return rawText.slice(0, 240)
  return `HTTP ${status}`
}

export function App() {
  const [parentOrigin, setParentOrigin] = useState<string | null>(null)
  const [lastReceivedAt, setLastReceivedAt] = useState<string | null>(null)
  const [latestPayload, setLatestPayload] = useState<PatientContextMessage | null>(null)
  const [localCandidate, setLocalCandidate] = useState<boolean | null>(null)
  const [apiStatus, setApiStatus] = useState<number | null>(null)
  const [apiOutcome, setApiOutcome] = useState<ApiOutcome | null>(null)
  const [apiMessage, setApiMessage] = useState<string | null>(null)

  const runEvaluate = useCallback(async (payload: PatientContextMessage, replyOrigin: string) => {
    const mode = payload.mode ?? 'success'
    const path = MODE_PATH[mode]
    const body = {
      firstName: payload.firstName,
      lastName: payload.lastName,
      age: payload.age,
      hearingLossSeverity: payload.hearingLossSeverity,
      wordRecognition: payload.wordRecognition,
    }

    const candidate = computeLocalCandidate(payload)
    setLocalCandidate(candidate)

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const rawText = await res.text()
      let json: unknown = null
      try {
        json = rawText ? JSON.parse(rawText) : null
      } catch {
        /* not JSON */
      }
      const outcome = mapOutcome(res.status)
      const message = summarizeApiMessage(res.status, json, rawText)
      setApiStatus(res.status)
      setApiOutcome(outcome)
      setApiMessage(message)

      const reply = {
        type: 'candidate_result' as const,
        patientId: payload.patientId,
        candidate,
        apiStatus: res.status,
        apiOutcome: outcome,
        message,
      }
      window.parent.postMessage(reply, replyOrigin)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network error'
      setApiStatus(0)
      setApiOutcome('error')
      setApiMessage(message)
      window.parent.postMessage(
        {
          type: 'candidate_result' as const,
          patientId: payload.patientId,
          candidate,
          apiStatus: 0,
          apiOutcome: 'error' as const,
          message,
        },
        replyOrigin,
      )
    }
  }, [])

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window.parent) return
      if (!isPatientContextMessage(ev.data)) return

      setParentOrigin(ev.origin)
      setLastReceivedAt(new Date().toLocaleTimeString())
      setLatestPayload(ev.data)
      void runEvaluate(ev.data, ev.origin)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [runEvaluate])

  return (
    <>
      <h1>Eleos (iframe demo)</h1>

      <section>
        <h2>Connection</h2>
        {!parentOrigin ? (
          <p className="status-waiting">Waiting for parent postMessage…</p>
        ) : (
          <p className="status-ok">
            Listening · last message from <code>{parentOrigin}</code>
            {lastReceivedAt ? ` at ${lastReceivedAt}` : null}
          </p>
        )}
      </section>

      <section>
        <h2>Latest patient payload</h2>
        {latestPayload == null ? (
          <p className="status-waiting">None yet.</p>
        ) : (
          <pre>{JSON.stringify(latestPayload, null, 2)}</pre>
        )}
      </section>

      <section className={localCandidate === true ? 'candidate-yes' : 'candidate-no'}>
        <h2>Local candidate (screening)</h2>
        {localCandidate == null ? (
          <p>—</p>
        ) : localCandidate ? (
          <p className="api-ok">Yes — severe/profound loss and word recognition &lt; 50%.</p>
        ) : (
          <p>No — does not meet local screening rule.</p>
        )}
      </section>

      <section>
        <h2>Latest API result</h2>
        {apiStatus == null ? (
          <p className="status-waiting">No request yet.</p>
        ) : (
          <>
            <p>
              <strong>Status:</strong> {apiStatus}{' '}
              <strong>Outcome:</strong>{' '}
              <span className={apiOutcome === 'success' ? 'api-ok' : 'api-error'}>{apiOutcome}</span>
            </p>
            <p>{apiMessage}</p>
          </>
        )}
      </section>
    </>
  )
}
