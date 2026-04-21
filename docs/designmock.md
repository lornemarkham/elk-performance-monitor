Mock Setup

Parent:
- Form inputs
- Sends patient data via postMessage
- Displays iframe responses

Iframe (Eleos):
- Receives messages
- Evaluates candidate
- Sends response back
- Calls mock API (success, slow, 401, error)

Purpose:
- Test extension behavior
- Understand interaction flow