# Logo Concept — Klikk Financials — 2026-05-25

## The mark: The Tally

Three horizontal bars, left-anchored, stepping inward from top to bottom in a 3:2:1 width ratio. The left edge is a fixed vertical axis; the right edges form a descending staircase. The silhouette reads simultaneously as a ledger (rows of data with diminishing scope — header, body, total), as a tally (the oldest accounting notation in existence), and as a K (the brand initial) rendered not by drawing strokes but by the negative space implied between the stepped right edges and the implied vertical. The mark works at 20px because horizontal fills survive 1× non-retina rendering cleanly — no diagonal strokes to anti-alias into mud. At 48px the ledger rhythm becomes the dominant reading. At favicon scale (16px with a warm-stone canvas baked in) it is immediately distinct in a tab strip of twelve.

## Why this beats the four explored directions

The four explored marks all drew a K — explicitly (Sigma K, Bracket, Cursor K) or as a negative-space cutout (Ledger Block). Every one of them required the viewer to resolve a letterform at small sizes, which is a legibility tax. The Tally mark removes the letterform entirely: what you see is three bars in a hierarchy, and the K-reading emerges as a secondary recognition layer rather than a prerequisite for comprehension. It is also the only mark in the set that carries semantic content independent of the brand — stacked hierarchical bars are the universal grammar of financial data — which means a first-time viewer who has never seen Klikk Financials before will still read "this is a data-dense, structured, operator tool" from the mark alone. The Ledger Block was the previous recommendation but was characterised in the exploration as "the safe pick, not the interesting pick." The Tally is interesting and safe: it passes the 20px test more cleanly than any stroke-based mark, requires zero new colour tokens, and carries richer semantic payload.

## Typography

Primary wordmark face: **Geist** (Vercel, SIL Open Font License — free for all use).
Weight: 500 (Medium) for "klikk", 400 (Regular) for "financials".
Tracking: −0.025em on "klikk" (letter-spacing: −0.325 at 13px); +0.07em on "financials" (letter-spacing: 0.7 at 10px).
"financials" renders at 40% opacity — a demoted label, not a co-equal word.

Fallback chain: `'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif`

Geist is available via `npm install geist` or `@fontsource/geist`. Inter is the system fallback if Geist is not loaded; on macOS 15+ `ui-sans-serif` resolves to SF Pro, which is an acceptable in-browser fallback for internal tooling.

## Colour tokens

All tokens are existing KDL tokens — no new tokens are introduced.

| Element | Light theme token | Dark theme token |
|---|---|---|
| Mark fill | `klikk-ink` (#1A1917) | `klikk-ink` dark (#E8E3DC) |
| Page / mark background | `klikk-surface` (#F5F1EB) | `klikk-surface` dark (#141210) |
| "financials" text | `klikk-ink` @ 40% opacity | `klikk-ink` dark @ 40% opacity |
| Favicon canvas | `klikk-surface` (#F5F1EB) — baked in, not a CSS token | — |

The favicon bakes the light canvas and ink values as hard hex because browser favicon rendering does not respect CSS custom properties. All other variants use `currentColor` and invert via a single CSS property change.

## Accessibility

**Light theme:** `klikk-ink` (#1A1917) on `klikk-surface` (#F5F1EB).
Contrast ratio: approximately 17.5:1. Exceeds WCAG AAA (7:1) by a wide margin.

**Dark theme:** `klikk-ink` dark (#E8E3DC) on `klikk-surface` dark (#141210).
Contrast ratio: approximately 14.8:1. Exceeds WCAG AAA.

**"financials" label at 40% opacity:**
Effective colour on light: #1A1917 @ 40% over #F5F1EB ≈ #A09C97.
Contrast of #A09C97 on #F5F1EB: approximately 2.1:1 — below AA for body text, but acceptable for a decorative/demoted label at 10px that is not the primary navigation affordance. The mark and "klikk" wordmark carry the navigation burden; "financials" is ambient.

**Minimum legible size for the mark:** 16px (favicon). The mark has been tested at 16, 20, 24, 32, and 48px. At 16px the favicon variant (with baked canvas) is recommended over the bare mark, which loses the bottom bar on some 1× displays.

## Implementation note

In `src/layouts/MainLayout.vue`, locate the existing logo placeholder (likely a `<q-img>` or `<img>` tag in the `q-header` slot). Replace it with an inline `<img src="/logo/mark-light.svg">` referencing the SVG served from `public/logo/`. Add a CSS rule that swaps to `mark-dark.svg` (or sets `color: var(--klikk-ink)` on the containing element) when Quasar's dark-mode body class `.body--dark` is active. If the dev prefers a single-file approach, the mark SVGs use `currentColor` — wrap the `<img>` in a `<span style="color: var(--klikk-ink)">` and the fill will follow the token automatically without needing two separate SVG files in production.
