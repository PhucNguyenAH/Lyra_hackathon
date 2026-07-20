# Minimalist Resumes Version Control Hub & Monitoring Dashboard

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | ARCHITECTURE
- **Owner slice:** Overview Hub & CV Editor Workspace

## Context
The user requests a structural layout update:
1. Remove "Recent Prep reviews" from the Overview Hub.
2. Overview Hub (Tab 1) must serve strictly as a monitoring dashboard showing:
   - Tracking stats numbers (applied, assessment, interview, offer).
   - Scrollable target jobs list (with 30m refresh notice).
   - Applied jobs application tracker list.
3. Resume Draft list must be moved *out* of Overview Hub and hosted inside the CV Editor (Tab 2) tab, serving as a dedicated Resume Version Control Hub. Users select a draft, upload new PDF profiles, or click to edit/tailor.

## Decision
We will refactor the platform architecture:
1. **Overview Hub (`components/drafts-dashboard.tsx`):**
   - Renders a clean stats metrics row at the top containing numerical trackers.
   - Dual column split layout:
     - Left Column (Span 2/3): Scrollable target jobs matching board.
     - Right Column (Span 1/3): Active Job Applications tracker.
2. **Page Router (`app/page.tsx`):**
   - Initialize `selectedDraftId: string` to `""` (empty) so the CV Editor tab defaults to the Resume Version Hub view.
   - Pass drafts hook states (`drafts`, `selectedDraftId`, `onSelectDraft`, `onImportCV`, `onDeleteDraft`) into `CVEditorWorkspace` so it can manage drafts selection.
3. **CV Editor Hub (`components/cv-editor/cv-editor-workspace.tsx`):**
   - Define prop signature to receive drafts hooks.
   - If `selectedDraftId === ""`: render the Resume Version Hub view detailing drafts list, upload PDF button (with simulated parsing progress), and delete draft capabilities.
   - If `selectedDraftId !== ""`: render the collapsible CV editor form columns and A4 Live PDF sheets. Clicking "Back" resets `selectedDraftId` to `""` returning to the Version Hub list.

## Alternatives Considered
- None. This fulfills all structural requirements cleanly.

## Consequences
- **What becomes easier:** High separation of concerns. Dashboard monitors applications/jobs. Builder drafts resumes.
- **What becomes harder:** Prop synchronization. We will write clear TypeScript prop interfaces.
