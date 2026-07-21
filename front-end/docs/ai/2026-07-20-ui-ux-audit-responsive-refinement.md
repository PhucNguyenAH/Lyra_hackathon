# UI/UX Audit & Responsive Refinement

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI
- **Owner slice:** UI

## Context
A full UI/UX pass was requested, with explicit focus on responsive behavior in the CV Builder/Editor and the Interview Chat. An audit of every component under `components/` surfaced a mix of genuine correctness bugs (not just polish) that violate the "make no mistakes" bar:

1. **Invalid Tailwind color utilities.** ~130 usages across 15 files reference zinc shades that don't exist in Tailwind's default scale (`zinc-150/250/350/450/550/555/650/655/750/850` — the real scale only has 50/100/200/300/400/500/600/700/800/900/950). Each of these compiles to a no-op class: no color is ever applied, so the element silently falls back to inherited text color instead of the intended muted tone.
2. **Missing Skills section in the CV Editor.** `SkillsTagEditor` and `SkillCategory` are imported in `cv-editor-workspace.tsx` but never rendered — users cannot edit `cvData.skills` at all in the editor, even though the live PDF preview reads and displays it.
3. **Dead zoom controls.** The Zoom In/Out buttons in `cv-pdf-preview.tsx` have no `onClick` handlers and the displayed "100%" never changes.
4. **No mobile shell.** `dashboard-layout.tsx` renders a fixed `w-80`/`w-20` sidebar unconditionally with `h-screen w-screen overflow-hidden` and no drawer/hamburger — on any viewport under ~1024px the sidebar consumes most of the screen.
5. **Forced horizontal scroll in the CV preview.** The A4 sheet in `cv-pdf-preview.tsx` is hardcoded to `w-[8.27in]` (~794px). Below that viewport width this forces the whole page to scroll horizontally, violating the no-horizontal-scroll rule.
6. **Sub-44px touch targets** on the interview chat's mic/send buttons (`w-10 h-10` = 40px).
7. **Uncontrolled Experience bullet textareas.** `cv-editor-workspace.tsx`'s Experience bullet `Textarea` had `value={bullet}` with no `onChange` — React logs a console error and the field is silently read-only (confirmed live via React's dev-mode warning). The parallel Projects bullet field already had the correct `onChange` wiring; Experience was just missing it.

Hackathon scope discipline applies: fixes favor demo reliability (no new dependencies, no backend/contract changes) over exhaustive redesign.

## Decision
Fix all six issues in place, scoped to existing components, with no new dependencies:

1. **Color tokens:** mechanically snap every invalid shade to the nearest valid Tailwind step, ties rounding down (e.g. `450`→`400`, `550`→`500`, `850`→`800`). This is deterministic, low-risk (the invalid classes were rendering nothing, so any valid neighbor is a visual improvement), and keeps every file consistent with the `zinc-200/400/500/800` pairs already used correctly elsewhere in the same files.
2. **Skills section:** add a collapsible "Skills" `Card` to `CVEditorWorkspace`, matching the existing Contact/Experience/Projects/Education pattern, wired to `cvData.skills` via `SkillsTagEditor`'s `onChange`.
3. **Zoom controls:** add local `zoomLevel` state (50–150%, step 10) applied via CSS `transform: scale()` on the A4 sheet wrapper, with the displayed percentage now live.
4. **Mobile shell:** below `lg`, the sidebar becomes an off-canvas drawer (fixed, `translate-x` transition, backdrop overlay, closes on nav select) triggered by a hamburger button in the header. At `lg+` the existing expand/collapse rail behavior is unchanged. Header and main content padding scale down on small viewports (`px-4 sm:px-6 lg:px-8`).
5. **CV preview scale-to-fit:** wrap the A4 sheet in a container that computes `scale = min(1, containerWidth / pageWidthPx)` via `ResizeObserver` and applies it as a CSS transform (combined multiplicatively with the manual zoom level from #3), so the page shrinks to fit narrow viewports without ever triggering page-level horizontal scroll. The print stylesheet explicitly resets `transform: none` so PDF export is unaffected and stays at true print dimensions.
6. **Touch targets:** bump chat mic/send buttons from 40px to 44px.

## Alternatives Considered
- **Option B (mobile shell): Use a real bottom-tab-bar for mobile instead of a drawer.** Rejected — the sidebar already carries per-item descriptions/badges the user relies on for orientation; a drawer preserves that content and is a smaller diff. Bottom nav is worth revisiting if the product moves further toward mobile-first usage.
- **Option B (CV preview): Let the page scroll horizontally inside a `overflow-x-auto` pane instead of scaling.** Rejected for the default view — an unscaled full-size resume behind a horizontal scrollbar is harder to review at a glance on a phone than a shrunk full page. Kept as an option users can reach anyway by zooming in past 100%, since the scaled wrapper still permits overflow at high zoom.
- **Option C (color tokens): Introduce custom Tailwind `--color-zinc-450` etc. theme tokens to make the "in-between" shades real.** Rejected — it would encode a mistake as permanent API surface; better to converge on the standard scale already used correctly throughout the codebase.

## Consequences
- **Easier:** future components can `grep zinc-[0-9]` and trust every match is a real, rendering utility; the CV editor is now feature-complete for the fields the preview actually shows.
- **Harder / debt:** none introduced — this is a net bug-fix pass, no new abstractions.
- **Revisit:** if the app moves toward being primarily mobile, replace the sidebar drawer pattern with a bottom tab bar per Priority 9 nav guidance (`bottom-nav ≤ 5 items`, which fits — there are exactly 4 sections today).
