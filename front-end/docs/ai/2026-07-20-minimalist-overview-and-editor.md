# Minimalist Overview Hub & Streamlined CV Editor

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | ARCH
- **Owner slice:** UI

## Context
The user requests a more minimalist design. Specifically:
1. Remove the standalone "Jobs Board" tab.
2. Put the jobs list, application status tracker, resume drafts, and mock interview feedback log all together into a unified, clean **Overview Hub** landing page.
3. Keep the CV Editor interface extremely clean and matching the newly provided screenshot (flat white input fields, vertical arrow pairs on the left of bullets, collapsible cards, and A4 print layout).

## Decision
We will execute the following refactoring:
1. **Sidebar Navigation Update:** Reduce tabs to exactly three:
   - `drafts` (renamed to "Overview Hub" in UI).
   - `cv-editor` ("CV Editor & Builder").
   - `interview` ("Interview Simulator").
2. **Overview Hub Consolidation:**
   - Organize the landing screen into a minimalist grid dashboard containing:
     - Top stats row.
     - Column 1: Resume Drafts table & target Jobs Board list side-by-side.
     - Column 2: Applied Job tracker widget.
     - Bottom: Completed mock interview feedback history logs.
3. **CV Editor UI Polish:**
   - Simplify inputs to render flat white input boxes with rounded borders (`rounded-xl border-zinc-200 bg-white`).
   - Bullet items will feature the up/down sorting arrows stacked vertically on the left side of the input box, followed by the glowing match indicator dot (if suggestions exist).
   - Collapse default sections (Contact, Skills, Experience) and expand Projects by default to match the user's reference image.

## Alternatives Considered
- None. This is a direct alignment with the user's design instructions to maximize minimalism and unify widgets.

## Consequences
- **What becomes easier:** Navigating the app is much simpler with fewer top-level sections.
- **What becomes harder:** The Overview Hub dashboard must display multiple lists cleanly without clutter. We will use a clean layout with adequate padding, subtle typography, and clear section dividers.
