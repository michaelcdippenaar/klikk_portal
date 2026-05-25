# FreshnessChip

**File:** `src/components/klikk/FreshnessChip.vue`
**Wave:** 2 — missing operator vocabulary
**Depends on:** `useRelativeTime` composable (`src/composables/useRelativeTime.js`)

## Purpose

Surfaces "when did this last happen" anywhere in the finance-admin UI: table captions, status-board rows, header status strips, operator cards. Wraps `useRelativeTime()` with prefix labels, staleness signalling, and a persistent absolute tooltip.

## API

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `Date \| string \| null` | required | The timestamp. Accepts ISO 8601 string for API compatibility. `null` renders "Never". |
| `prefix` | `string` | `null` | Optional label prepended before the time: `"Last sync: 4m ago"` |
| `staleAfter` | `number` | `null` | Staleness threshold in minutes. Shifts chip to warning tone + clock icon when exceeded. |
| `format` | `'relative' \| 'absolute' \| 'both'` | `'relative'` | `'both'` shows relative as primary + absolute in muted small text. |

## States / variants

| State | Visual |
|---|---|
| Fresh, relative | Muted 13px text. No icon. Tooltip = absolute ISO datetime. |
| Fresh, prefix | `"Last sync: 4m ago"` — prefix renders before time, same muted token. |
| Fresh, format=both | Relative primary text + smaller muted absolute secondary next to it. |
| Null value | `"Never"` in hint token, italic. No tooltip. |
| Stale | Warning tone text (`#D97706` light / `#FBBF24` dark) + 12px clock icon left of text. |

## Accessibility

- Tooltip via native `title` attribute — visible on hover to pointing-device users.
- Clock icon is `aria-hidden="true"` — the text colour change is the semantic signal; icon is decorative reinforcement.
- The component is an inline `<span>` — does not interrupt document flow or introduce landmark noise.
- WCAG AA contrast (muted token on white): `#6B7280` on `#FFFFFF` = 4.61:1 (pass).
- WCAG AA contrast (stale warning, light): `#D97706` on `#FFFFFF` = 4.52:1 (pass).
- WCAG AA contrast (stale warning, dark): `#FBBF24` on `#161827` = 7.1:1 (pass).

## Migration mapping

| Old pattern | Migrate to |
|---|---|
| `<span class="kop-card__timestamp">{{ relativeTime }}</span>` in KOperationCard | Use `<FreshnessChip :value="lastRunAt" />` — KOperationCard's meta row still owns the full timestamp composable; FreshnessChip is for standalone freshness display outside a card. |
| Inline `{{ new Date(ts).toLocaleString() }}` with a manual `:title` | `<FreshnessChip :value="ts" />` — composable handles relative + absolute; tooltip is automatic. |
| `<span v-if="ts">{{ relativeTime }}</span><span v-else>Never run</span>` | `<FreshnessChip :value="ts" />` — null branch is built in. |

## Usage examples

```vue
<!-- Simple: just the relative time -->
<FreshnessChip :value="lastSyncAt" />

<!-- With prefix -->
<FreshnessChip :value="lastSyncAt" prefix="Last sync" />

<!-- With staleness threshold (warn after 5 minutes) -->
<FreshnessChip :value="lastSyncAt" :stale-after="5" prefix="Loaded" />

<!-- Both formats — relative primary, absolute secondary -->
<FreshnessChip :value="lastSyncAt" format="both" />

<!-- Never state -->
<FreshnessChip :value="null" prefix="Last run" />
```
