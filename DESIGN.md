# BedLink Clinical Design System

## Principles
1. **Calm & High-Reliability**: Soft slate surfaces, clear non-distracting visual boundaries, generous spacing. Not a startup landing page.
2. **Clinical Legibility**: Minimum font size 14px. Tabular numerals on all counts, times, and countdowns. The primary number is always the largest element.
3. **WCAG AA Verification**: Body text > 4.5:1, UI components and large text > 3:1.
4. **Safety-First Touch Targets**: Interactive targets ≥ 48px; high-acuity actions (triage accept, steppers) 56px–64px with ≥ 8px spacing.
5. **No Emojis & No Forbidden Styling**: Lucide 24px/2px icons only. Never use color alone for status. Single subtle elevation shadow `0 1px 2px rgba(0,0,0,0.08)`.

## Tokens
- **Surfaces**: `--bg`, `--surface`, `--surface-2`, `--border`
- **Typography**: `--text`, `--text-2`
- **Accent**: `--accent`, `--accent-text-on`
- **Semantic Status**: `--ok-text`/`--ok-surface`, `--warn-text`/`--warn-surface`, `--danger-text`/`--danger-surface`, `--unknown-text`/`--unknown-surface`
- **Radii**: 8px (controls), 12px (cards), 999px (pills)
- **Spacing Scale**: 4, 8, 12, 16, 24, 32, 48px
- **Type Scale**: 14, 16, 20, 24, 32, 48, 64px
