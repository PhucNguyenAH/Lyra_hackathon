# Interactive STAR Report Assessment Dashboard

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | DATA
- **Owner slice:** Interview Practice

## Context
The user requests another layout for the interview simulator report screen. We want to align this report screen closely with the gorgeous card dashboard layout shown in the user's screenshots (Circular Response Score, STAR breakdowns, Quality Parameters, Quantified Metrics warning, and Topic Coverage checklists) but adapt it to work with a blind mock interview flow (only displaying this dashboard post-session).

## Decision
We will redesign the `REPORT` view of `InterviewWorkspace` into a premium **Assessment Dashboard**:
1. **Active Selected Question Context:** Introduce state `activeReviewQuestionIdx: number` (default: `0` representing the overall session average, or `1` for the first question).
2. **Double Column Assessment Grid:**
   - **Left Column (Timeline Feed):**
     - Renders a clean timeline showing all questions asked and candidate answers.
     - Clicking a question sets it as the active question index, updating all dashboard widgets instantly.
   - **Right Column (STAR Diagnostic Board):**
     - **Circular Score Gauge:** Renders response score (e.g., 88/100).
     - **STAR Scoring Breakdown:** Renders horizontal progress bars for Situation, Task, Action, and Result scores.
     - **Quality Parameters:** Renders sliders/bars for Relevance to Question and Technical Specificity.
     - **Quantified Metrics Presence:** Renders a warning/success card checking if numeric metrics were detected, with suggestions.
     - **Detailed Feedback Review:** Renders the prose comments.
     - **Syllabus Coverage checklist:** Displays completed categories.

## Alternatives Considered
- **Option B: Showing inline expanded scorecards.** Rejected. Swapping the dashboard values on-click is much cleaner, more compact, and provides a much more interactive and polished experience.

## Consequences
- **What becomes easier:** The user gets a extremely high-fidelity analytics board matching their exact design screens, fully connected to their live answers.
- **What becomes harder:** Synchronizing state. We will write clean mapping hooks that update the active metrics variables instantly.
