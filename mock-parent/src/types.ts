export type ApiMode = 'success' | 'slow' | 'unauthorized' | 'invalid'

export type PatientContextPayload = {
  type: 'patient_context'
  patientId: string
  firstName: string
  lastName: string
  age: number
  hearingLossSeverity: string
  wordRecognition: number
  mode: ApiMode
}

export type CandidateResultPayload = {
  type: 'candidate_result'
  patientId: string
  candidate: boolean
  apiStatus: number
  apiOutcome: string
  message: string
}

export function isCandidateResult(data: unknown): data is CandidateResultPayload {
  if (data == null || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  return (
    o.type === 'candidate_result' &&
    typeof o.patientId === 'string' &&
    typeof o.candidate === 'boolean' &&
    typeof o.apiStatus === 'number' &&
    typeof o.apiOutcome === 'string' &&
    typeof o.message === 'string'
  )
}
