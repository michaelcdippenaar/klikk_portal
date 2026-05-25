# KOperationCard Primitive

**Status:** Shipped — `feat/klikk-reskin-phase-1`
**File:** `src/components/klikk/KOperationCard.vue`
**Composable:** `src/composables/useRelativeTime.js`
**Preview:** `/_klikk-preview` — section ⑨

---

## Purpose

`KOperationCard` is the canonical card for operator surfaces in Klikk Financials. It answers three questions at a glance:

1. **What is its current state?** — status pill (top-right of header)
2. **When did it last act?** — relative timestamp with absolute tooltip on hover
3. **How is it doing?** — one quantitative signal (metric)

A card that cannot answer all three is not an operator card and must not be used on operator surfaces. See the Operator-card doctrine in `klikk-design-language` SKILL.md.

---

## API (as shipped)

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | `string` | Yes | — | Card heading — the operation name |
| `description` | `string` | No | `null` | Muted single-line subtitle below title |
| `state` | `'idle'\|'running'\|'queued'\|'failed'\|'succeeded'` | Yes | — | Drives status pill (icon + label + tinted background) |
| `lastRunAt` | `Date\|string\|null` | Yes | `null` | Last-run date. Accepts Date object or ISO string. `null` renders "Never run" in hint token |
| `metric` | `string` | No | `null` | Quantitative signal. Falls back to `—` (em-dash) if omitted |
| `lastError` | `string` | No | `null` | Error text rendered below meta row in error tone |
| `primaryAction` | `{ label: string, handler: Function }` | No | `null` | Inline action button (secondary style). Use the `primaryAction` slot for full control |

### Slots

| Slot | Purpose |
|---|---|
| `primaryAction` | Full control over the primary action area (overrides `primaryAction` prop) |
| `secondaryActions` | Overflow menu (e.g. Lucide `MoreHorizontal` + `q-menu`). Rendered right of primary action |
| `default` | Optional body content — config forms, checkboxes, etc. |

### State pill spec (as shipped)

| State | Icon | Colour | Background |
|---|---|---|---|
| `idle` | Lucide `Circle` (outlined) 12px | `--kdl-text-muted` | transparent, `--kdl-border` outline |
| `running` | Lucide `Loader2` 12px with spin | `--kdl-accent` | 10% accent tint |
| `queued` | Lucide `Clock` 12px | `#d97706` (warning-600) | 10% warning tint |
| `failed` | Lucide `XCircle` 12px | `#dc2626` (danger-600) | 10% danger tint |
| `succeeded` | Lucide `CheckCircle` 12px | `#0d9488` (success-600) | 10% success tint |

Dark mode: all tints use alpha-channel equivalents from the 400-series semantic palette.

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ Xero Journal Sync                          [ Running... ] │  ← header row
│ Posts approved journals to the Xero ledger               │
├──────────────────────────────────────────────────────────│
│ [clock] 4m ago · 142 rows · 28s          [ View logs ]  │  ← meta row
├──────────────────────────────────────────────────────────│
│ [x] Xero API returned 503 — connection timeout…          │  ← error row (if lastError)
├──────────────────────────────────────────────────────────│
│ (optional body slot)                                     │  ← body (if default slot used)
└──────────────────────────────────────────────────────────┘
```

- Header row padding: `14px 20px 12px`
- Meta row padding: `8px 20px`
- Body padding: `16px 20px`
- No bottom-right CTA. Primary action is **inline right of the meta row**, styled as `btn-ghost btn-sm`.

---

## The em-dash rule

If `metric` is not provided (null / undefined), the card renders `—` (em-dash) with a tooltip:

> "Metric not yet wired — backend data pipe pending"

This is intentional doctrine: the em-dash makes "we haven't built the data pipe" a **visible TODO** that ships in the UI, not an invisible omission. Do not render the metric slot absent.

---

## useRelativeTime composable

`src/composables/useRelativeTime.js`

Returns a reactive `{ relative, absolute }` pair for a `Date | null` ref.

| Input | relative output | absolute output |
|---|---|---|
| `null` | `'Never run'` | `''` |
| < 60s ago | `'just now'` | full locale datetime |
| < 60m ago | `'4m ago'` | full locale datetime |
| < 24h ago | `'2h 15m ago'` | full locale datetime |
| yesterday | `'yesterday 14:03'` | full locale datetime |
| 2–6d ago | `'3 days ago'` | full locale datetime |
| 7–30d ago | `'2 weeks ago'` | full locale datetime |
| > 30d ago | `'2026-04-10'` (YYYY-MM-DD) | full locale datetime |

Updates every 30 seconds via `setInterval`. Cleaned up on `onUnmounted`. The `absolute` value is used as the `title` attribute on the timestamp element (browser tooltip on hover).

---

## Backend data shape for Processes page retrofit

When the senior-dev picks up the Processes page retrofit, the Django API needs to expose the following shape per process/operation:

```json
{
  "id": "xero-journal-sync",
  "title": "Xero Journal Sync",
  "description": "Posts approved journals to the Xero ledger",
  "state": "running",
  "last_run_at": "2026-05-25T10:21:00+02:00",
  "metric": "142 rows · 28s",
  "last_error": null
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier for keying |
| `title` | `string` | Human-readable operation name |
| `description` | `string \| null` | Optional subtitle |
| `state` | `'idle'\|'running'\|'queued'\|'failed'\|'succeeded'` | Current state of the process runner |
| `last_run_at` | ISO 8601 datetime string with timezone, or `null` | Null if never run |
| `metric` | `string \| null` | Quantitative signal. Null renders as `—` on the card. Examples: `"142 rows · 28s"`, `"98% over 30d"`, `"5 / 5,000 today"` |
| `last_error` | `string \| null` | Last error message. Null hides the error row |

**For the current preview demos**, static `Date` objects are used (no API call). Backend ticket is CTO scope.

---

## Usage example

```vue
<KOperationCard
  title="Xero Journal Sync"
  description="Posts approved journals to Xero ledger"
  state="running"
  :last-run-at="process.lastRunAt"
  :metric="process.metric"
  :primary-action="{ label: 'View logs', handler: openLogs }"
/>

<KOperationCard
  title="Bank Reconciliation"
  state="failed"
  :last-run-at="process.lastRunAt"
  last-error="Xero API returned 503 — connection timeout after 30s"
  :primary-action="{ label: 'Retry', handler: retryRecon }"
>
  <!-- optional body slot -->
  <label class="flex items-center gap-2 text-small">
    <input type="checkbox" v-model="loadAllData" />
    Load all historical data on next run
  </label>
</KOperationCard>
```

---

## Cross-references

- Operator-card doctrine: `klikk-design-language` SKILL.md — Finance Admin variant — Operator-card doctrine section
- Finance Admin primitives table: SKILL.md — Finance Admin variant — Primitives
- Preview: `src/pages/KlikkPreview.vue` — section ⑨
- Composable: `src/composables/useRelativeTime.js`
