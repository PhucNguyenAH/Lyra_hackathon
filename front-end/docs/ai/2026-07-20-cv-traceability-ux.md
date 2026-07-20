# CV Traceability Hover UX

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI
- **Owner slice:** UI / CV enhancement

## Context
Per CLAUDE.md §2.3 and §5.3, the tailoring UI must visually surface traceability (e.g. hover a tailored bullet → see the source bullet and which requirement it targets). This is the key trust moment of the hackathon demo. We need an intuitive, responsive, and robust interaction pattern.

## Decision
We will implement an interactive hover-trace system:
1. Every tailored bullet element will contain a unique `id` and a data-source-ref attribute.
2. In the Tailored CV view, when a user hovers over a bullet, the interface will trigger a state change setting the active trace target.
3. This state will:
   - Highlight the corresponding source bullet in the Master CV panel (with a matching border/glow and background color).
   - Scroll-into-view or highlight the targeted job posting requirement in the Requirements checklist.
   - Display a floating badge showing the change type (e.g., `EMPHASIZED`, `REWORDED`).

## Alternatives Considered
- **Option B: Tooltips/HoverCards on the bullet.** Rejected as the primary display because tooltips block page view and can't easily draw focus to the other sections of the dashboard. Instead, we'll use side-by-side highlighting which displays the relationship between the three columns (Requirements -> Master CV -> Tailored CV) simultaneously.

## Consequences
- **What becomes easier:** The user sees exactly how the AI worked, boosting confidence in the output.
- **What becomes harder:** The UI state needs to coordinate hover events across three columns. We will implement this with a shared hover state context (`activeHoverRef`).
