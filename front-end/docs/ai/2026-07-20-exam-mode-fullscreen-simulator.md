# Exam Mode Fullscreen Simulator & Sidebar Refinement

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | ARCHITECTURE
- **Owner slice:** Layout & Interview Practice

## Context
The user requests that when starting an interview, they must see a confirm dialog and the simulator must open in fullscreen. Additionally, we need to fix a visual bug in the sidebar icons layout (nested overlapping double cards).

## Decision
We will execute three coordinated refactors:
1. **Sidebar layout fix (`components/dashboard-layout.tsx`):**
   - Refactor active menu button styling to prevent double-overlapping borders.
   - If active, the button gets a clean lavender background `bg-indigo-50/60`, and the nested icon container gets a solid indigo card with white icon `bg-indigo-600 text-white`.
   - Add a `hideSidebar` boolean prop. If true, hide the `<aside>` sidebar and top header completely, letting the children occupy the full viewport for distraction-free assessment.
2. **Exam mode integration (`app/page.tsx`):**
   - Introduce state `isExamMode: boolean` in the page router.
   - Pass `hideSidebar={isExamMode}` to `DashboardLayout`.
   - Pass `onExamModeChange={(active) => setIsExamMode(active)}` to `InterviewWorkspace`.
3. **Confirm dialog and timer (`components/interview-practice/interview-workspace.tsx`):**
   - Add a confirm state `showConfirmStart: boolean` and render a high-fidelity confirmation modal before initiating the session.
   - Add state `timerSeconds: number` and update it every second while `screen === "INTERVIEW" && !isPaused`.
   - Render the formatted timer `MM:SS` in the session control bar.

## Alternatives Considered
- None. This design delivers a clean fullscreen exam view and resolves the sidebar styling bugs.
