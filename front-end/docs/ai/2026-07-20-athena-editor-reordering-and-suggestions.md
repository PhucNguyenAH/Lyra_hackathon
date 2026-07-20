# Athena Editor Reordering & Tailored Suggestions

- **Date:** 2026-07-20
- **Status:** accepted
- **Type:** UI | DATA
- **Owner slice:** CV Enhancement

## Context
The user wants to rename the tool to **Athena** and add specific features matching their screenshots:
1. **Adding & Arranging Sections:** Let users click "+ Add experience", "+ Add project", and "+ Add education" buttons, and drag or re-order these blocks (as well as individual bullets) using sorting arrows or mock drag controls.
2. **Inline AI Suggestions:** Bullets with matching gaps should display colored indicator dots (orange/blue/cyan) that can be clicked to view AI optimization suggestions, showing matched score impact and letting the user accept/apply the suggestion inline.

## Decision
We will execute the following:
1. **Global Name Change:** Rename all UI headers, sidebars, and tab labels from "Lyra" to "Athena".
2. **Hoisted Dynamic State:** Extend the experience, project, and education models in React state to support:
   - Dynamic adding of items (e.g., pushing empty objects to arrays).
   - Reordering of items: We will implement up/down reordering buttons (styled like drag handles) on experience/project cards and bullet items. This gives complete sorting power, is highly reliable, and compiles smoothly.
3. **Inline Suggestions Popover:**
   - Pre-populate specific bullets with a "suggested enhancement" field.
   - Show an orange/blue glowing dot next to these bullets.
   - Clicking the dot opens a clean popover detailing: "Match score increase: +8%", "Suggested text: ...", and an "Accept Enhancement" button.
   - Accepting updates the bullet value in the editor and preview in real time, and boosts the match score badge!

## Alternatives Considered
- **Option B: Integrating react-beautiful-dnd or @hello-pangea/dnd.** Rejected. Heavy drag-and-drop libraries can be finicky inside Next.js 16 (App Router) and React 19 due to server-side rendering and client-side hydrations. Custom state-based array element swappers (triggered by click-to-move-up/down controls) are 100% reliable, compile instantly, and are fully responsive.

## Consequences
- **What becomes easier:** The user gets an extremely interactive, high-fidelity experience matching the product screenshots, with the ability to dynamically edit the CV.
- **What becomes harder:** More complex nested array state updates in React. We will write clean element swappers and updater helpers in the editor workspace.
