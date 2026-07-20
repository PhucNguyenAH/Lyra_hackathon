# Interview Blind Mode & Post-Session Reporting

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | ARCH
- **Owner slice:** Interview Practice

## Context
In the previous layout design, the mock interview workspace displayed real-time scorecards and syllabus category indicators on the right side of the active session screen. The user wants to hide these elements during the session (to mimic a real blind interview) and only present the full scorecard breakdown and topic coverage analytics in the final post-interview summary report.

## Decision
We will execute the following:
1. **Active Session (Blind Mode):**
   - The active interview screen (`screen === "INTERVIEW"`) will render only the `InterviewChat` component at full width (or centered with clean bounds), hiding the real-time scorecard panels and the topic checklist.
   - The interviewer prompts will avoid referencing syllabus categories directly (e.g. "Now let's move to topic 2: Tailwind CSS..."). Instead, the interviewer will speak in natural transitional phrases.
2. **Post-Session Report (Summary Hub):**
   - Once the session completes, the screen routes to `"REPORT"`.
   - The Report screen will display:
     - The overall average score circular gauge.
     - The compiled Syllabus Coverage track.
     - An interactive **Response History & Review** log listing all questions asked.
     - Clicking a question expands a card showcasing its specific **STAR Scorecard** breakdown (Situation, Task, Action, Result, Specificity, Relevance) and qualitative commentary.

## Alternatives Considered
- **Option B: Showing a simplified progress bar during the session.** Rejected because the user specifically requested "dont hint the category or something" to preserve complete blind testing. A simple text question count (e.g., "Question 2 of 5") is acceptable to keep the candidate aware of progression without hinting at evaluation domains.

## Consequences
- **What becomes easier:** The active interview screen is clean and focused, improving concentration.
- **What becomes harder:** The workspace needs to collect and store the individual scores of all answered questions into a list in state, to render the collapsible cards in the final report. We will add a state hook `sessionResults: ScoreBreakdown[]`.
