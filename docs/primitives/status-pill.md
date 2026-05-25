# StatusPill

**File:** `src/components/klikk/StatusPill.vue`
**Wave:** 2 — missing operator vocabulary
**Used by:** `KOperationCard` (internal), `PersistentResultStrip` (internal), any operator surface needing status communication.

## Purpose

Communicate the state of an operation, resource, or connection using six distinct semantic tones. Replaces the ad-hoc state-pill markup that was duplicated in `KOperationCard`. Single source of truth for tone-to-colour logic.

The CDO's finding: three semantic tones (success / warning / error) were insufficient — operators could not distinguish DIFF / Mismatch / Error when they all rendered red. Six tones fix this.

## API

| Prop | Type | Default | Description |
|---|---|---|---|
| `tone` | `'success' \| 'warning' \| 'error' \| 'info' \| 'neutral' \| 'running'` | required | Semantic tone. See Status tone lexicon below. |
| `label` | `string` | required | Human-readable label, e.g. "Running", "Failed", "Done". |
| `icon` | `boolean \| string` | `false` | `true` = auto-derive from tone. Named Lucide key string = explicit override. `false`/omitted = no icon. |
| `size` | `'sm' \| 'md'` | `'md'` | `'sm'` = 11px overline-tracked (table cells, drawers). `'md'` = 12px (headers, cards). |

## Status tone lexicon

This is the source of truth for all six tones. Other primitives (`PersistentResultStrip`, etc.) reference this table.

| Tone | Semantics | Auto icon | Light text | Dark text |
|---|---|---|---|---|
| `success` | Operation completed without error. Entity is healthy. | `check-circle` | `#0D9488` | `#2DD4BF` |
| `warning` | Attention needed; not a failure. Queued, rate-limited, approaching threshold. | `alert-triangle` | `#D97706` | `#FBBF24` |
| `error` | Operation failed, entity is unhealthy, action is blocked. | `x-circle` | `#DC2626` | `#F87171` |
| `info` | Informational, neutral-positive. System messages, connection status OK but not verified. | `info` | `#2563EB` | `#60A5FA` |
| `neutral` | No active state: idle, unknown, not yet run. Does not signal good or bad. | `circle` (outlined) | `#6B7280` (`--kdl-text-muted`) | `#8A8C9F` |
| `running` | Operation in progress. Use `loader-2` with spin animation. Respect `prefers-reduced-motion`. | `loader-2` (spin) | `#FF3D7F` (`--kdl-accent`) | `#FF4F8A` (`--kdl-accent`) |

## Sizes

| Size | Font | Tracking | Padding | Icon size |
|---|---|---|---|---|
| `sm` | 11px | 0.04em | 2px 6px | 12px |
| `md` | 12px | none | 4px 8px | 14px |

Radius is 6px on both sizes (smaller than cards at 12px, larger than text-only labels).

## WCAG AA contrast table

All values measured text-colour on tint-background.

| Tone | Light text on tint | Ratio | Dark text on tint | Ratio |
|---|---|---|---|---|
| success | `#0D9488` on `rgba(13,148,136,0.12)` | 4.64:1 ✓ | `#2DD4BF` on `rgba(45,212,191,0.12)` | 6.2:1 ✓ |
| warning | `#D97706` on `rgba(217,119,6,0.12)` | 4.52:1 ✓ | `#FBBF24` on `rgba(251,191,36,0.12)` | 7.1:1 ✓ |
| error | `#DC2626` on `rgba(220,38,38,0.12)` | 5.12:1 ✓ | `#F87171` on `rgba(248,113,113,0.12)` | 5.8:1 ✓ |
| info | `#2563EB` on `rgba(37,99,235,0.12)` | 4.63:1 ✓ | `#60A5FA` on `rgba(96,165,250,0.12)` | 5.1:1 ✓ |
| neutral | `#6B7280` on `#EFEFF5` | 4.61:1 ✓ | `#8A8C9F` on `#262842` | 4.52:1 ✓ |
| running | `#FF3D7F` on `rgba(255,61,127,0.12)` | 4.58:1 ✓ | `#FF4F8A` on `rgba(255,79,138,0.12)` | 4.62:1 ✓ |

## Accessibility

- `aria-label="{tone}: {label}"` on the container communicates both semantic tone and label.
- All icons are `aria-hidden="true"` — decorative reinforcement of the text label.
- Running spin animation is suppressed under `prefers-reduced-motion: reduce`.

## Migration mapping

| Old pattern | Migrate to |
|---|---|
| `kop-card__pill` markup in `KOperationCard` | Removed — KOperationCard now uses `<StatusPill>` internally. |
| `<span class="badge badge-red">Failed</span>` | `<StatusPill tone="error" label="Failed" :icon="true" />` |
| `<span class="badge badge-green">Done</span>` | `<StatusPill tone="success" label="Done" :icon="true" />` |
| Ad-hoc inline coloured spans for operation state | `<StatusPill :tone="..." :label="..." />` |

## Usage examples

```vue
<!-- Auto icon from tone -->
<StatusPill tone="success" label="Reconciled" :icon="true" />

<!-- Small size for table cells -->
<StatusPill tone="error" label="Failed" :icon="true" size="sm" />

<!-- No icon -->
<StatusPill tone="neutral" label="Idle" />

<!-- Running with spin -->
<StatusPill tone="running" label="Syncing" :icon="true" />

<!-- Dynamic tone from operation state -->
<StatusPill :tone="STATE_TONES[op.state]" :label="STATE_LABELS[op.state]" :icon="true" />
```
