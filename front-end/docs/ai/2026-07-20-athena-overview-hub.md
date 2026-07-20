# Athena Overview Hub

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | DATA
- **Owner slice:** UI

## Context
The user wants a unified landing dashboard (Athena Overview Hub) that acts as the control center of their job application pipeline. Instead of just listing drafts, the main dashboard needs to aggregate:
1. Resume drafts (as before).
2. Applied job tracking (classified jobs with application status: e.g. Applied, Interview Scheduled, Offer).
3. Interview practice prep feedback (summaries of mock sessions, STAR scores, categories).

## Decision
We will restructure the landing tab (`drafts` tab, renamed to `dashboard` tab) into a grid-based **Overview Hub**:
1. **Top Metrics Row:** Quick counts (e.g. Resumes, Jobs Saved, Applications Tracked, Mock Interviews Conducted).
2. **Left Column - Resume Drafts:** The drafts metadata grid (as before).
3. **Right Column - Applied Jobs Tracker:** A tracking checklist showing applied roles, company, dates, and status pills (e.g., "Applied", "Interview", "Offer").
4. **Bottom Full-Width Column - Interview Prep Feedback Hub:** Renders a summary table of completed interviews showing Role, Overall Score, Date, STAR framework summary, and Key Gaps identified, enabling users to click to review score details or re-run practice.

## Alternatives Considered
- **Option B: Creating separate sub-pages for application tracking and prep feedback.** Rejected for the demo scope. Displaying them as widgets on a single unified landing dashboard is much more visually cohesive and gives the user a centralized overview at a glance.

## Consequences
- **What becomes easier:** The user sees their full hackathon flow (CV -> Jobs -> Interview feedback) on a single unified control board.
- **What becomes harder:** Synchronizing state between components. We will hoist all application lists, drafts, and mock scorecards to `app/page.tsx` so changes update the overview widgets instantly.
