import cors from 'cors'
import express from 'express'

const PORT = 4010
const app = express()

app.use(cors())
app.use(express.json())

function isSevereOrProfound(severity) {
  if (severity == null || typeof severity !== 'string') return false
  const s = severity.trim().toLowerCase()
  return s === 'severe' || s === 'profound'
}

function computeCandidate(body) {
  const wordRec =
    typeof body.wordRecognition === 'number'
      ? body.wordRecognition
      : Number(body.wordRecognition)
  const wrOk = Number.isFinite(wordRec)
  const severe = isSevereOrProfound(body.hearingLossSeverity)
  const candidate = severe && wrOk && wordRec < 50
  return {
    candidate,
    wordRecognition: wrOk ? wordRec : null,
    hearingLossSeverity: body.hearingLossSeverity ?? null,
  }
}

function successResponse(body) {
  const { candidate, wordRecognition, hearingLossSeverity } = computeCandidate(body)
  return {
    ok: true,
    candidate,
    message: candidate
      ? 'Meets screening criteria (severe/profound loss and word recognition < 50%).'
      : 'Does not meet screening criteria.',
    inputSummary: {
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      age: body.age ?? null,
      hearingLossSeverity,
      wordRecognition,
    },
  }
}

const VALIDATION_ERROR_BODY = {
  ok: false,
  error: 'validation_error',
  message: 'Request failed validation.',
  errors: [
    { field: 'wordRecognition', message: 'Must be a number between 0 and 100.' },
    { field: 'hearingLossSeverity', message: 'Must be one of: mild, moderate, severe, profound.' },
  ],
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'elk-mock-api',
    status: 'running',
  })
})

app.post('/api/evaluate', (req, res) => {
  res.json(successResponse(req.body ?? {}))
})

app.post('/api/evaluate-slow', async (req, res) => {
  await new Promise((r) => setTimeout(r, 2500))
  res.json(successResponse(req.body ?? {}))
})

app.post('/api/evaluate-401', (_req, res) => {
  res.status(401).json({
    ok: false,
    error: 'unauthorized',
    message: 'Authentication required.',
  })
})

app.post('/api/evaluate-invalid', (_req, res) => {
  res.status(400).json(VALIDATION_ERROR_BODY)
})

app.listen(PORT, () => {
  console.log(`mock-api listening on http://localhost:${PORT}`)
})
