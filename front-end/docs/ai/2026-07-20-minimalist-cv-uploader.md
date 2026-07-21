# Minimalist CV Uploader & Neutral Theme Audit

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | DATA
- **Owner slice:** Overview Hub & Theme

## Context
The user requests a minimalist, low-color styling and a visual Drag-and-Drop area to upload and parse PDF resumes directly inside the Overview Hub dashboard.

## Decision
We will refactor the platform UI and add a PDF dropzone:
1. **Dashed PDF Dropzone Widget (`components/drafts-dashboard.tsx`):**
   - Renders a clean, dashed dropzone border box at the top of the Overview Hub.
   - Supports dragging `.pdf` files or clicking to browse.
   - Simulates AI parsing: shows a progress spinner from 0% to 100% and triggers `onImportCV` to create a CV draft.
   - Integrates Sonner toast notifications upon successful parse.
2. **Minimalist Style Audit:**
   - Refactor active backgrounds to use neutral greys (`bg-zinc-100`, `bg-zinc-200`) and border-zinc-200 offsets.
   - Tone down high-saturation accents (replace vibrant indigo gradients with a solid dark zinc slate `bg-zinc-900 text-white hover:bg-zinc-800`).
   - Badges default to neutral slates unless representing a direct alert state.

## Alternatives Considered
- None. This aligns with the requested minimalism and drag-and-drop parser.

## Consequences
- **What becomes easier:** The user can interactively upload real resumes to parse profiles, and the UI feels much cleaner, modern, and unified.
- **What becomes harder:** None.
