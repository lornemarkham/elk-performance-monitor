import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiMode, PatientContextPayload } from './types'
import { isCandidateResult } from './types'

const IFRAME_ORIGIN = 'http://localhost:5174'
const IFRAME_SRC = `${IFRAME_ORIGIN}/`

const defaultForm = {
  patientId: 'demo-001',
  firstName: '',
  lastName: '',
  age: '65',
  hearingLossSeverity: 'moderate',
  wordRecognition: '60',
  mode: 'success' as ApiMode,
}

export function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [form, setForm] = useState(defaultForm)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [lastSent, setLastSent] = useState<PatientContextPayload | null>(null)
  const [lastReply, setLastReply] = useState<unknown>(null)
  const [lastReplyAt, setLastReplyAt] = useState<string | null>(null)

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== IFRAME_ORIGIN) return
      if (ev.source !== iframeRef.current?.contentWindow) return
      if (!isCandidateResult(ev.data)) return
      setLastReply(ev.data)
      setLastReplyAt(new Date().toLocaleTimeString())
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const sendToEleos = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) {
      window.alert('Iframe not ready.')
      return
    }
    const age = Number(form.age)
    const wordRecognition = Number(form.wordRecognition)
    if (!Number.isFinite(age) || !Number.isFinite(wordRecognition)) {
      window.alert('Age and word recognition must be numbers.')
      return
    }
    const payload: PatientContextPayload = {
      type: 'patient_context',
      patientId: form.patientId.trim() || 'unknown',
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      age,
      hearingLossSeverity: form.hearingLossSeverity,
      wordRecognition,
      mode: form.mode,
    }
    setLastSent(payload)
    win.postMessage(payload, IFRAME_ORIGIN)
  }, [form])

  const resetForm = () => {
    setForm({ ...defaultForm })
    setLastSent(null)
    setLastReply(null)
    setLastReplyAt(null)
  }

  const loadCandidateExample = () => {
    setForm({
      patientId: 'candidate-100',
      firstName: 'Alex',
      lastName: 'Rivera',
      age: '58',
      hearingLossSeverity: 'severe',
      wordRecognition: '38',
      mode: 'success',
    })
  }

  const loadNonCandidateExample = () => {
    setForm({
      patientId: 'non-candidate-200',
      firstName: 'Jordan',
      lastName: 'Lee',
      age: '45',
      hearingLossSeverity: 'mild',
      wordRecognition: '88',
      mode: 'success',
    })
  }

  return (
    <>
      <h1>Mock parent (host)</h1>
      <p className="sub">
        Embeds Eleos iframe at <code>{IFRAME_SRC}</code> · start mock-api (4010) + mock-eleos-iframe (5174)
        first.
      </p>

      <div className="layout">
        <div className="panel">
          <h2>Patient &amp; API mode</h2>

          <div className="field">
            <label htmlFor="patientId">patientId</label>
            <input
              id="patientId"
              value={form.patientId}
              onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="firstName">firstName</label>
            <input
              id="firstName"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="lastName">lastName</label>
            <input
              id="lastName"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="age">age</label>
            <input
              id="age"
              type="number"
              value={form.age}
              onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="hearingLossSeverity">hearingLossSeverity</label>
            <select
              id="hearingLossSeverity"
              value={form.hearingLossSeverity}
              onChange={(e) => setForm((f) => ({ ...f, hearingLossSeverity: e.target.value }))}
            >
              <option value="mild">mild</option>
              <option value="moderate">moderate</option>
              <option value="severe">severe</option>
              <option value="profound">profound</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="wordRecognition">wordRecognition (%)</label>
            <input
              id="wordRecognition"
              type="number"
              value={form.wordRecognition}
              onChange={(e) => setForm((f) => ({ ...f, wordRecognition: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="mode">mode (mock API)</label>
            <select
              id="mode"
              value={form.mode}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as ApiMode }))}
            >
              <option value="success">success</option>
              <option value="slow">slow</option>
              <option value="unauthorized">unauthorized</option>
              <option value="invalid">invalid</option>
            </select>
          </div>

          <div className="row-btns">
            <button type="button" className="primary" onClick={sendToEleos}>
              Send to Eleos
            </button>
            <button type="button" onClick={resetForm}>
              Reset form
            </button>
            <button type="button" onClick={loadCandidateExample}>
              Load candidate example
            </button>
            <button type="button" onClick={loadNonCandidateExample}>
              Load non-candidate example
            </button>
          </div>

          <div className="panel" style={{ marginTop: 14, marginBottom: 0 }}>
            <h2>Connection / status</h2>
            {iframeLoaded ? (
              <p className="status-ok">Iframe loaded · posting to {IFRAME_ORIGIN}</p>
            ) : (
              <p className="status-warn">Waiting for iframe to load…</p>
            )}
            {lastReplyAt ? (
              <p className="status-ok">Last reply at {lastReplyAt}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#71717a' }}>No reply from iframe yet.</p>
            )}
          </div>

          <div className="panel" style={{ marginTop: 14, marginBottom: 0 }}>
            <h2>Last payload sent</h2>
            {lastSent == null ? (
              <p style={{ fontSize: 13, color: '#71717a' }}>—</p>
            ) : (
              <pre>{JSON.stringify(lastSent, null, 2)}</pre>
            )}
          </div>

          <div className="panel" style={{ marginTop: 14, marginBottom: 0 }}>
            <h2>Last reply received</h2>
            {lastReply == null ? (
              <p style={{ fontSize: 13, color: '#71717a' }}>—</p>
            ) : (
              <pre>{JSON.stringify(lastReply, null, 2)}</pre>
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Eleos iframe</h2>
          <iframe
            ref={iframeRef}
            title="mock-eleos-iframe"
            src={IFRAME_SRC}
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      </div>
    </>
  )
}
