# Drawer Section Header Pattern

**Status:** Shipped — `feat/klikk-reskin-phase-1`
**Component:** `src/layouts/PipelineLayout.vue`
**Governs:** All collapsible nav-group section headers inside `q-drawer` surfaces across Klikk apps.

---

## Purpose

Collapsible sections in a narrow (220px) nav drawer need two things the un-decorated float-label pattern fails to provide:

1. **Affordance** — the user must be able to see that the section is collapsible before clicking.
2. **Orientation** — when several sections exist, the user needs a visual hierarchy break between them.

The section-header pattern provides both with four elements: a hairline divider, a rotating caret, an uppercase label, and an optional item-count badge.

---

## Anatomy

```
┌──────────────────────────────────┐
│ ────────── hairline divider ────  │  ← 1px var(--kdl-border-subtle), skipped on first section
│ [v] XERO                      4  │  ← caret + label + count badge
│   > Processes                    │
│   > Data Viewer                  │
│   > Comparison                   │
│   > Connect to Xero              │
└──────────────────────────────────┘
```

- **Caret:** Lucide `ChevronDown`, 12px, stroke 1.75. Rotates `-90deg` (pointing right) when section is collapsed. CSS `transform: rotate()` transition — not icon swap.
- **Label:** 11px / weight 600 / uppercase / tracking +0.06em / `var(--kdl-text-muted)`. See "11px exception" below.
- **Count badge:** 11px, muted, pill shape (`--kdl-border-subtle` background). Rendered only when `items.length > 1`. Single-item sections skip the badge (it's already obvious).
- **Hairline divider:** `height: 1px`, `background: var(--kdl-border-subtle)`, `margin: 4px 2px 0`. Skipped on the very first section (`v-if="groupIndex > 0"`).

---

## Spacing

| Property | Value |
|---|---|
| Toggle row padding | `8px 12px` (vertical / horizontal) |
| Space above divider | `4px` (`margin-top` on the wrapper) |
| Gap between caret and label | `5px` |
| Gap between items | `1px` |
| Item indent (left padding) | `22px` |

---

## 11px label — documented exception to the 12px floor

The section label renders at **11px**, which is below the KDL 12px floor.

**Rationale:** Overline / section labels in constrained nav drawers (220px wide) have a long-standing exception in the KDL base skill (`sidebar-section-label` class). At 12px with uppercase + tracking, "Financial Investments" clips in 220px. The 11px size is used only for this specific role — decorative overline, non-readable-body text — and is weight 600 (not weight 400), which restores legibility.

**Scope of exception:** Nav-drawer section labels only. Do not use 11px elsewhere. The `.label-upper` class (12px, used everywhere else) is not affected.

**Precedent:** Same tradition as `.sidebar-section-label` in `klikk.css` (12px, uppercase, tracking) — this is a one-step tightening for the 220px drawer context only.

---

## Active-route highlighting

When a route inside a section is the current route:

- The section **label** gets `font-weight: 700` and `color: var(--kdl-text-secondary)` (slightly bolder and darker).
- This is implemented via `.kdl-nav-group__toggle--active-section .kdl-nav-group__label`.
- The section does NOT get a background colour — only weight/colour change. Keep it subtle.
- **Item active state** (`.kdl-nav-item--active`) is handled separately in `PipelineLayout.vue` and is owned by the Bundle 2 work. The section-label active modifier does not touch item active styling.

---

## Collapse state

- Persisted to `localStorage` under key `klikk:portal:nav` (JSON object of `{ [groupKey]: boolean }`).
- Auto-expands the group containing the active route on navigation.
- Default: Xero expanded, all others collapsed.

---

## Hover behaviour

- Toggle row: `background: var(--kdl-hover-bg)` on hover. `cursor: pointer`.
- No border change on hover (no layout shift).
- Transition: `background var(--duration-short) var(--ease-standard)`.

---

## Icons — Lucide only

All icons in the nav items use **inline SVG paths** from `lucide-vue-next` shapes, rendered at 14px, stroke 1.75. The previous `q-icon` (Material Icons) usage is replaced. Material Icons are banned on finance-admin surfaces per the Finance Admin variant rules in `klikk-design-language` SKILL.md.

The icon set used in `PipelineLayout.vue`:

| Route | Lucide icon |
|---|---|
| Processes | `play-circle` |
| Data Viewer | `table` |
| Comparison | `git-compare` |
| Connect to Xero | `link` |
| Share holdings | `pie-chart` |
| Share transactions | `list` |
| Share codes | `tag` |
| Account | `landmark` |
| Stocks | `trending-up` |
| Dividend Forecast | `dollar-sign` |
| Pipeline | `bar-chart-2` |

---

## Reuse in other Klikk drawers

When implementing a collapsible section-header nav in any other Klikk app drawer:

1. Copy the `.kdl-nav-group` block from `PipelineLayout.vue`.
2. Use `v-if="groupIndex > 0"` to skip the first divider.
3. Keep label at 11px / 600 / uppercase / +0.06em tracking — this is the canonical shape.
4. Keep caret at 12px Lucide `ChevronDown` with CSS rotate transform (`-90deg` when collapsed).
5. Count badge is optional — skip for sections where the count is always obvious.
6. Persist collapse state to `localStorage` with a namespaced key.
7. Auto-expand on active route via `watch(() => route.name, ...)`.
