# BedLink interface rollout

## Current audit
- The project is a blank starter page, so it has no existing clinical UI to preserve.
- The current page has no workflow, safety states, accessible controls, or task hierarchy.
- The current generic colors and inherited metadata do not meet the BedLink product brief.

## Tokens for this build
- Light: off-white background, white surfaces, dark slate text, one clinical blue accent, and distinct green/amber/red/neutral status pairs from the supplied values.
- Dark: graphite surfaces, light text, a single light-blue accent, and the supplied status pairs.
- Inter/system type with the supplied 14–64px scale, tabular numerals, 8/12/999px radii, and the single permitted shadow.
- All controls will keep a 48px minimum touch target, visible 3px focus treatment, and reduced-motion behavior.

## First delivery: Nurse screen
- Create the shared visual language, reusable status and freshness patterns, app bar, connection state, language/theme controls, and sticky confirmation action.
- Build the mobile nurse bed-count workflow with ICU, ventilator, oxygen, cardiac, and burns rows, optimistic stepper updates, simple-count mode, offline state, and undo confirmation.
- Add the initial localized English strings with Hindi and Marathi key-matched stubs, plus fixture data isolated for replacement later.
- Capture the nurse view at 360×640 and 390×844 in light and dark after implementation for approval before building the remaining screens.

## Technical details
- Keep the existing TanStack application structure and avoid backend changes.
- Use semantic CSS tokens mapped to Tailwind utilities. No gradients, decorative artwork, neon, or hover-only controls.
- Add BedLink-specific metadata to the home page.

## Second delivery: Hospital incoming offer
- Add the hospital idle screen and its high-visibility incoming-offer takeover state.
- Keep accept/reject actions vertically separated, with countdown, expiry, held-bed and superseded states.
- Capture the hospital view at 360×640 and 390×844 in light and dark for approval before dispatch work.
