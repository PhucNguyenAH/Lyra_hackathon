# CV Progressive Tailoring Workflow & Colorful Aesthetics

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI
- **Owner slice:** CV Enhancement

## Context
The user wants a progressive step-by-step workflow instead of a single-shot tailoring form. They also requested moving away from plain black/white / grayscale towards a rich, colorful layout with consistent typography.

## Decision
We will execute the following:
1. **Progressive Steps Workflow:**
   - **Step 1: Job Confirmation.** The user inputs/reviews the Job Posting and clicks "Verify Job Requirements".
   - **Step 2: Match Score & Gap Comments.** The UI displays the matched requirements checklist, the CV match score (with a colored progress gauge), and specific gap commentary. The user reviews and clicks "Generate Tailored Suggestions".
   - **Step 3: Suggestions & Traceability Preview.** The UI presents the interactive tailored CV previews with hover trace highlights.
2. **Color Palette Enhancements:**
   - Introduce rich color elements: Indigo/Violet gradient titles, amber/emerald alerts, colored matching gauges, and background meshes (`bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5`).
   - Eliminate plain black/white borders, replacing them with subtle translucent indigo borders (`border-indigo-150/40 dark:border-indigo-900/30`).
3. **Typography Cleanliness:**
   - Fix `globals.css` to remove the fallback `Arial, Helvetica` override, ensuring Geist Sans (`font-sans`) renders consistently everywhere.

## Alternatives Considered
- **Option B: Multi-step tab panel.** Rejected because a wizard/stepper flow (`ActiveStep` indicator at the top) gives a much clearer sense of progression compared to independent tabs.

## Consequences
- **What becomes easier:** The user is guided step-by-step through the CV evaluation process, simulating a real recruitment parser tool.
- **What becomes harder:** The workspace component must manage the state machine for the wizard progress.
