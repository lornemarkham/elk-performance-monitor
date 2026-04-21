export type ApiMode = 'success' | 'slow' | 'unauthorized' | 'invalid'

export type PatientContextMessage = {
  type: 'patient_context'
  patientId: string
  firstName: string
  lastName: string
  age: number
  hearingLossSeverity: string
  wordRecognition: number
  mode?: ApiMode
}

export type ApiOutcome = 'success' | 'unauthorized' | 'validation_error' | 'error'

export type CandidateResultMessage = {
  type: 'candidate_result'
  patientId: string
  candidate: boolean
  apiStatus: number
  apiOutcome: ApiOutcome
  message: string
}

export function isPatientContextMessage(data: unknown): data is PatientContextMessage {
  if (data == null || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  if (o.type !== 'patient_context') return false
  return (
    typeof o.patientId === 'string' &&
    typeof o.firstName === 'string' &&
    typeof o.lastName === 'string' &&
    typeof o.age === 'number' &&
    typeof o.hearingLossSeverity === 'string' &&
    typeof o.wordRecognition === 'number'
  )
}
