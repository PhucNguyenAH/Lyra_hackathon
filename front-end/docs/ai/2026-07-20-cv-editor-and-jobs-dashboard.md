# CV Editor & Jobs Dashboard System

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** ARCH | UI | DATA
- **Owner slice:** UI / CV Enhancement

## Context
The user wants to expand the CV tailoring tool into a full CV Builder & Jobs Board Dashboard. This includes:
1. A **Drafts Dashboard** showcasing existing resumes, importing/uploading capabilities, and search features.
2. A **Jobs Dashboard** showcasing matching job postings with match scores, save/apply buttons, and skill requirements.
3. A **CV Editor** (matching user-provided screenshots) with form inputs on the left (Contact details, Summary, and a dynamic Tag-based Skills editor) and a live PDF-styled preview on the right that supports printing/exporting.

## Decision
We will build a multi-page routing state in `app/page.tsx` that coordinates the following main views:
1. `DRAFTS_DASHBOARD`: Matches Image 4. Lists drafts in a clean table, allows searching, and has an upload button.
2. `JOBS_DASHBOARD`: Lists target roles with percentage match badges, key skills, and save/apply/tailor buttons.
3. `CV_EDITOR`: Matches Image 1 & 2. Left side features collapsible form categories (Contact, Summary with 'Generate' action, Skills tag list manager, Experience, Projects). Right side renders a preview styled exactly like a printed PDF, complete with an "Export PDF" button.
4. `INTERVIEW_PRACTICE`: Integrates the mock interviewer simulator.

State will be stored in-memory at the root `page.tsx` level to allow smooth transitions:
- `drafts`: Array of drafts.
- `currentDraft`: The active draft being edited.
- `jobs`: List of mock jobs with calculated match scores based on the current draft.

## Alternatives Considered
- **Option B: Using a real PDF library (like react-pdf or jspdf).** Rejected for the demo. It is much more reliable and stylistically controllable to render the preview as a CSS-printed A4 page container on screen, and use `window.print()` or standard browser style blocks to let users save/download as PDF directly. This is extremely robust and avoids bulky binary library issues in the dev/build phase.

## Consequences
- **What becomes easier:** The user gets a complete CV editing experience identical to the product mocks.
- **What becomes harder:** Synchronizing form fields with the resume preview in real time. We will use a shared state `draftData` mapping to all inputs.
