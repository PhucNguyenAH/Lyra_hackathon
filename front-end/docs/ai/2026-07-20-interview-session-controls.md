# Mock Interview Session Controls

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | DATA
- **Owner slice:** Interview Practice

## Context
During an active mock interview session, the user needs actions to control the interview flow. We want to add features to pause the interview, request hints/explanations, finish early to compile reports, and quit back to the setup dashboard.

## Decision
We will extend the active `INTERVIEW` screen control headers in `InterviewWorkspace`:
1. **Request Hint:** Add a "Request Hint" button. Clicking appends a message from the `System` helper detailing a contextual tip (e.g. "Tip: Quantify your results or specify React 19 concurrent hooks").
2. **Pause Interview:** Add a "Pause Session" button. Toggles a state `isPaused`. When active, it displays a blurred glassmorphic overlay over the timeline, blocking input, showing a pulsing "Interview Paused" header, and a "Resume" button.
3. **Finish Early:** Add a "Finish Interview" button. Clicking terminates the loop early, compiles the `answeredQuestions` scores so far, and routes to `"REPORT"`.
4. **Go Back:** Add a "Quit / Go Back" button that resets state and returns the user to the simulator Setup panel.

## Alternatives Considered
- None. This completes the active session control requirements.

## Consequences
- **What becomes easier:** The user has full autonomy during mock sessions.
- **What becomes harder:** Handling early reports. If no questions are answered yet, "Finish Early" should alert the user or redirect them to Setup instead of crashing. We will add a guard check.
