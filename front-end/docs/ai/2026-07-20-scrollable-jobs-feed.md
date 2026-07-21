# Scrollable Target Jobs feed & Refreshed intervals

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | DATA
- **Owner slice:** Overview Hub

## Context
The user requests that the target jobs board match list inside the Overview Hub be scrollable, include a helper indicator showing it refreshes every 30 minutes, and have a beautifully balanced grid layout on the dashboard.

## Decision
We will refactor `components/drafts-dashboard.tsx` with these updates:
1. **Scrollable viewport:** Wrap the target matching jobs list in a fixed-height scroll container (`max-h-[380px] overflow-y-auto pr-1`).
2. **Refresh Schedule Text:** Add a muted helper badge/text next to the Jobs card title: `"Refreshes every 30m"` along with a small neutral `Clock` icon.
3. **Balanced Grid Layout:**
   - Left Column (Span 2/3): Renders the Saved Resumes list card and the new Scrollable Target Jobs card.
   - Right Column (Span 1/3): Renders the Job Applications tracker and the Recent Prep Reviews card stacked vertically.
   - This prevents empty scroll height mismatches and creates a balanced dual-column dashboard.

## Alternatives Considered
- None. This balances the layout perfectly.

## Consequences
- **What becomes easier:** The user's screen space is conserved due to scroll limits, and they get clear status intervals.
- **What becomes harder:** None.
