# Account Settings entry for LinkedIn connection

- **Date:** 2026-07-22
- **Status:** proposed
- **Type:** UI, CONTRACT
- **Owner slice:** UI (shared dashboard) — change originates from the job-scraping slice

## Context

The job scraper needs a logged-in LinkedIn session. Phase 1 built a standalone
`/connect-linkedin` page that streams a server-side browser via noVNC for the
user to log in. The dashboard has no entry point to it, and the owner wants to
reach it from an "Account settings" area (bottom-left of the dashboard shell),
matching a conventional app-shell mental model. This requires editing the shared
`components/dashboard-layout.tsx`, which is owned by the CV/Interview slice.

## Decision

Add an **Account settings** entry to the dashboard shell (bottom-left) that opens
a **Connect LinkedIn** panel; the panel reuses the existing `/connect-linkedin`
streamed-login logic unchanged. No new login method is introduced in this change
(the username/password hybrid form is deferred).

## Alternatives Considered

- **Standalone `/settings` route, not touching `dashboard-layout.tsx`:** zero risk
  to the teammate's UI, but doesn't deliver the "bottom-left of the dashboard"
  placement the owner asked for. Rejected for UX; kept as the fallback if the
  slice owner objects to the shared-layout edit.
- **A top-level nav tab ("Connect LinkedIn"):** smaller change, but clutters the
  primary task nav (Drafts/Jobs/CV/Interview) with an infrequent setup action.
  Rejected — account setup belongs in settings, not the task nav.

## Consequences

- Easier: users discover and re-run LinkedIn connection without knowing a URL.
- Harder / debt: introduces a shared-layout dependency between the scraping slice
  and the CV/Interview slice; future dashboard restructures must preserve the
  settings entry. The panel currently embeds Phase-1 inline styling, not the
  shadcn/Tailwind system — a follow-up restyle is likely.
- Revisit if: app-level auth arrives (Phase 3) — "Account settings" would then
  also host user identity, changing this area's scope.

## Contract Impact

This change edits shared UI owned by another slice.

- **Consumes (from the scraping/backend slice):** the `/api/auth/session/*`
  endpoints and `/connect-linkedin` page behavior (admin token, streamed VNC,
  status polling) — treated as a stable contract from Phase 1.
- **Exposes / assumes (to the CV/Interview slice owner):** a new bottom-left
  "Account settings" affordance in `components/dashboard-layout.tsx`. Assumption
  flagged to the owner for review: the settings entry must coexist with the
  existing sidebar/tab structure without displacing task navigation.
