export type SessionSignals = {
  clusterCount: number
  apiCalls: number
  messageCount: number
  pageErrors: number
  completeFlows: number
  failedFlows: number
  successfulEval: number
  failed401: number
  failedOther: number
  anyFailedRequest: boolean
  hadPatientContext: boolean
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>
}

function buildPrompt(signals: SessionSignals): string {
  return `You are a senior software engineer diagnosing runtime behavior in a web application.

Analyze the signals and explain WHY failures likely happened when present—or, if there are no failures (anyFailedRequest false, pageErrors 0, failedFlows 0), one precise sentence on what succeeded (parent/iframe/API as applicable).

Rules:
- 1–3 sentences max
- Be specific, not generic
- Suggest likely causes: auth issues, network, bad request, integration mismatch
- If messageCount > 0, consider parent ↔ iframe issues (origin, payload shape, timing)
- If failed401 > 0 or anyFailedRequest with auth-shaped failures, mention auth/session/token/credential problems
- No fluff, no hedging language (“might”, “possibly”, “could be”)

Signals:
${JSON.stringify(signals)}`
}

export async function generateAIExplanation(signals: SessionSignals): Promise<string | null> {
  try {
    if (typeof window === 'undefined') return null
    const apiKey = (window as any).__ELK_OPENAI_KEY as string | undefined
    if (apiKey == null || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return null
    }

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: buildPrompt(signals) }],
        temperature: 0.2,
      }),
    })

    if (!res.ok) return null

    const data = (await res.json()) as ChatCompletionResponse
    const content = data.choices?.[0]?.message?.content ?? null
    if (content == null || typeof content !== 'string') return null
    const trimmed = content.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}
