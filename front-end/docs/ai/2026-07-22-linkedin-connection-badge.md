# LinkedIn connection status badge in the dashboard

- **Date:** 2026-07-22
- **Status:** proposed
- **Type:** UI, CONTRACT
- **Owner slice:** UI (shared dashboard) — change originates from the job-scraping slice

## Context

The scraper's usable-session state (`has_session`) was only observable
indirectly (a `409` from `/jobs`). Phase 3 exposes it via a backend
`GET /connection` endpoint and surfaces it in the dashboard so the user knows
whether they need to (re)connect LinkedIn. This edits the shared
`components/dashboard-layout.tsx` (CV/interview slice owner's UI), next to the
Account settings entry added in Phase 2.

## Decision

Add a small "LinkedIn connected / not connected" badge near the bottom-left
Account settings entry. It fetches `GET /api/connection` on mount and after the
Connect LinkedIn dialog closes; the "not connected" state is clickable and
opens the existing Connect LinkedIn dialog.

## Alternatives Considered

- **Poll on an interval:** rejected — unnecessary traffic; fetch-on-mount +
  refetch-after-dialog covers the meaningful transitions for a single-user tool.
- **Badge in the top header instead of the sidebar footer:** rejected — keeps
  connection concerns co-located with the Account settings entry rather than
  cluttering the primary task header.

## Consequences

- Easier: the user immediately sees connection state and a one-click path to
  reconnect; expiry (flipped by the backend on a failed scrape) shows up here.
- Debt: extends the scraping slice's dependency on the shared dashboard layout
  (already introduced in Phase 2). Badge styling should match the app's
  shadcn/Tailwind system.

## Contract Impact

- **Consumes (from the backend slice):** `GET /connection` → `{"connected": boolean}`,
  unauthenticated, boolean-only (no cookies/secrets). Treated as a stable
  contract.
- **Exposes / assumes (to the CV/Interview slice owner):** an additional
  bottom-left badge element in `components/dashboard-layout.tsx`, adjacent to
  the existing Account settings entry, not displacing task navigation.
