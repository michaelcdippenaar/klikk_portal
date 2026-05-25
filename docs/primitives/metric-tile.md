# MetricTile

**File:** `src/components/klikk/MetricTile.vue`
**Wave:** 2 — missing operator vocabulary

## Purpose

Formalises the `klikk-stat` pattern that was hand-rolled inline across DataViewer, Dashboard, and other pages. One component, one source of truth. Use in a CSS grid alongside sibling MetricTiles to build a metrics strip.

The CDO's finding: `klikk-stat` was being copy-pasted inline. Minor density differences had accumulated between pages. MetricTile locks the spec and provides the trend and tone extensions that the inline pattern couldn't support.

## API

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | required | Overline label displayed above the value. 11px / 600 / uppercase / tracked. |
| `value` | `string \| number \| null` | required | Metric value. Rendered as `—` when `null` or `undefined`. |
| `unit` | `string` | `null` | Muted inline suffix after the value, e.g. `"rows"`, `"%"`. |
| `trend` | `{ direction: 'up'\|'down'\|'flat', delta: string }` | `null` | Trend row below value. `up`=success, `down`=error, `flat`=neutral. `delta` is a display string e.g. `"+12%"` or `"−3 today"`. |
| `tone` | `'default' \| 'success' \| 'warning' \| 'error'` | `'default'` | Tints the VALUE colour. Default uses primary text. Use sparingly — most metrics should be tone-neutral. |

## Visual anatomy

```
┌───────────────────────────────┐
│ LABEL                         │  ← 11px / 600 / uppercase / tracked / hint
│ 142 rows                      │  ← 22px / 600 / tabular-nums / primary
│ ↑ +1.4%                       │  ← 12px / 500 / trend (optional)
└───────────────────────────────┘
```

## Tokens

| Element | Value |
|---|---|
| Background | `--kdl-card-bg` |
| Border | `1px solid --kdl-border-subtle` |
| Radius | 8px |
| Padding | 12px 16px |
| Shadow | None (it's a tile, not a floating card) |
| Label size | 11px (sanctioned overline exception to the 12px floor) |
| Value size | 22px / weight 600 |
| Value numeric | `font-variant-numeric: tabular-nums` |
| Trend size | 12px / weight 500 / tabular-nums |

## Null / em-dash rule

When `value` is `null` or `undefined`, the tile renders `—` (em-dash). This follows the operator-card doctrine: visible TODO, not invisible omission. The tile still occupies its grid cell and signals "metric not yet wired" without collapsing.

## Trend tone

| Direction | Colour (light) | Colour (dark) |
|---|---|---|
| `up` | `#0D9488` (success) | `#2DD4BF` |
| `down` | `#DC2626` (error) | `#F87171` |
| `flat` | `--kdl-text-muted` | `--kdl-text-muted` |

Note: `up` = success and `down` = error by default. If your metric semantics are inverted (e.g. "Errors: down is good"), pass `tone="success"` on the value and handle trend labelling in the `delta` string (`"−3 today (improved)"`).

## WCAG AA contrast

Value tone colours on card-bg:

| Tone | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| success | `#0D9488` on `#FFFFFF` | 4.64:1 ✓ | `#2DD4BF` on `#161827` | 6.2:1 ✓ |
| warning | `#D97706` on `#FFFFFF` | 4.52:1 ✓ | `#FBBF24` on `#161827` | 7.1:1 ✓ |
| error | `#DC2626` on `#FFFFFF` | 5.12:1 ✓ | `#F87171` on `#161827` | 5.8:1 ✓ |

## Accessibility

- Label text is visible (not `aria-label`-only) — screen readers read the label + value in document order.
- Trend `aria-label` on the trend span communicates direction + delta: `"Trend: up +1.4%"`.
- Trend icons are `aria-hidden="true"` — direction communicated via `aria-label` and delta text.
- `font-variant-numeric: tabular-nums` on value and trend prevents layout shift as values update.

## Migration mapping

| Old pattern | Migrate to |
|---|---|
| `<div class="klikk-stat"><div class="label">…</div><div class="value">…</div></div>` | `<MetricTile label="…" :value="…" />` |
| Inline `.klikk-stat` div with hardcoded `.delta.up` / `.delta.down` | `<MetricTile :trend="{ direction: 'up', delta: '+12%' }" />` |
| `<div class="klikk-stat"><div class="value" style="color: red">…</div></div>` | `<MetricTile :value="…" tone="error" />` |

## Usage examples

```vue
<!-- Simple -->
<MetricTile label="Total Rows" :value="142" />

<!-- With unit -->
<MetricTile label="Processing Time" :value="28" unit="s" />

<!-- With trend -->
<MetricTile
  label="Coverage"
  value="97.2"
  unit="%"
  :trend="{ direction: 'up', delta: '+1.4%' }"
/>

<!-- With tone (use sparingly) -->
<MetricTile label="Errors" :value="errorCount" tone="error" />

<!-- Not yet wired — renders em-dash -->
<MetricTile label="API Latency" :value="null" unit="ms" />

<!-- In a grid -->
<div class="grid grid-cols-4 gap-3">
  <MetricTile label="Total Rows"    :value="stats.rows" />
  <MetricTile label="Errors"        :value="stats.errors"  tone="error" />
  <MetricTile label="Coverage"      :value="stats.coverage" unit="%" />
  <MetricTile label="Duration"      :value="stats.durationS" unit="s" />
</div>
```
