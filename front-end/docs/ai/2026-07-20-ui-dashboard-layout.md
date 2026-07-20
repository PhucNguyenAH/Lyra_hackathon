# UI Dashboard Layout

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI
- **Owner slice:** UI

## Context
For the hackathon demo, we need to showcase two distinct slices: CV Enhancement and Interview Practice. These two tools need to feel part of a unified suite with high-fidelity aesthetics, while allowing the user to switch seamlessly between them without losing local session state.

## Decision
We will build a single-page app layout featuring:
1. A persistent sidebar for navigation between "CV Optimizer" and "Interview Simulator" with sub-navigation showing session status (e.g. active mock interview, match scores).
2. A header displaying the current active page, dark/light theme switch, and simulated user profile metadata.
3. Tabbed views/workspaces (`cv-tailor-workspace.tsx` and `interview-workspace.tsx`) that manage their own React states, wrapping states in memory to prevent loss when switching views.

## Alternatives Considered
- **Option B: Multi-page router (Next.js `/cv` and `/interview` paths).** Rejected because Next.js page transitions reload/reset state unless nested layout states are carefully hoisted. A tabbed toggle inside a single shell is faster to construct, guarantees instant state preservation, and reduces loading overhead for the live demo.

## Consequences
- **What becomes easier:** Simulating real-time updates and sharing state (like exporting optimized CV data directly into the interview generator) becomes extremely simple.
- **What becomes harder:** The main `page.tsx` needs to manage the active workspace route.
- **What must be revisited:** If we add more tools later, we should shift to standard page routing.
