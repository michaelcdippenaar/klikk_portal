# PersistentResultStrip

**File:** `src/components/klikk/PersistentResultStrip.vue`
**Wave:** 2 — missing operator vocabulary
**Depends on:** `StatusPill`, `FreshnessChip`

## Purpose

Replaces toast-only failure surfacing. Every long-running operator action persists its last-run state inline on the page so an operator returning hours later still sees what happened — not just an empty screen with no context.

The CDO's finding: toasts disappear. An operator reconciling at 09:00 triggers a sync that silently fails; they return at 14:00 to find the screen shows nothing. PersistentResultStrip ensures the last-run result is always visible inline.

## API

| Prop | Type | Default | Description |
|---|---|---|---|
| `result` | `object \| null` | required | Last-run result object. `null` = renders nothing (absence is the signal). |
| `result.status` | `'success' \| 'error' \| 'running'` | required | Drives StatusPill tone and strip tint. |
| `result.completedAt` | `Date \| string \| null` | required | Timestamp for FreshnessChip. `null` = shows "Never". |
| `result.durationMs` | `number` | optional | Run duration (not currently displayed — reserved for v3 caller formatting). |
| `result.summary` | `string` | optional | Summary text. Markdown-lite: `**bold**` and `*italic*` only. |
| `result.error` | `string` | optional | Error message — rendered in a second row below the strip in error tone. Only shown when `status='error'`. |
| `result.actions` | `Array<{ label: string, handler: Function }>` | optional | Action buttons rendered right of the FreshnessChip. |
| `title` | `string` | `null` | Strip heading, e.g. "Last reconciliation". Hidden in compact mode (shifts to muted summary fallback). |
| `compact` | `boolean` | `false` | Single-line variant for use above tables. |

## Visual anatomy

### Multi-line (default)

```
┌─ left-border 2px ────────────────────────────────────────────────────────┐
│ [StatusPill]  Title: summary text…              FreshnessChip  [Actions] │
│               Error message (error row, full-width)                       │
└───────────────────────────────────────────────────────────────────────────┘
```

### Compact

```
┌─ left-border 2px ─────────────────────────────────────────────────────────┐
│ [StatusPill sm]  Summary or title            FreshnessChip  [Actions]     │
└────────────────────────────────────────────────────────────────────────────┘
```

## Tokens

| Element | Value |
|---|---|
| Border-left | 2px solid tone colour (NOT 4px Bootstrap-4 left bar pattern) |
| Background | Tone colour at 3–5% alpha |
| Radius | 6px |
| Padding (full) | 12px 16px |
| Padding (compact) | 8px 12px |

## Accessibility

- `role="status"` on the container — screen readers announce dynamic updates without interrupting the user.
- `aria-label` summarises the strip: `"Last reconciliation: Failed: Journal posting failed."`.
- Error row content is in the DOM (not hidden) — readable by screen readers without interaction.
- Action buttons use the standard `btn-ghost btn-sm` class which includes `:focus-visible` ring.

## Null behaviour

When `result` is `null` or `undefined`, the component renders **nothing**. Do not add a "No result yet" placeholder — the absence of the strip is itself a signal to the operator (this operation has not run in this session).

## Markdown-lite security

The `summary` prop is rendered via `v-html` after sanitisation. Only `**bold**` → `<strong>` and `*italic*` → `<em>` are supported. All HTML entities are escaped before transformation. Do not pass raw user input to `summary`.

## Migration mapping

| Old pattern | Migrate to |
|---|---|
| `useToast().error(...)` as sole failure signal | Keep the toast for immediate feedback + add `<PersistentResultStrip :result="lastRun" />` below the page header or above the table. |
| Inline error banner that disappears on route change | `<PersistentResultStrip>` — result is reactive; persists as long as the reactive object lives. |
| `<ResultPanel status="error">` | `PersistentResultStrip` is the operator-surface equivalent. ResultPanel is for setup flows. |

## Usage examples

```vue
<!-- Success with summary and freshness -->
<PersistentResultStrip
  title="Last reconciliation"
  :result="{
    status: 'success',
    completedAt: lastRunAt,
    summary: '**142 rows** reconciled. 3 skipped.',
    actions: [{ label: 'View details', handler: openDetails }],
  }"
/>

<!-- Running state (no completedAt yet) -->
<PersistentResultStrip
  title="Last sync run"
  :result="{ status: 'running', completedAt: null, summary: 'Fetching…' }"
/>

<!-- Error with retry action -->
<PersistentResultStrip
  title="Last posting run"
  :result="{
    status: 'error',
    completedAt: lastRunAt,
    error: 'Xero API returned 503 — timeout after 30s.',
    actions: [{ label: 'Retry', handler: retryRun }],
  }"
/>

<!-- Compact above-table variant -->
<PersistentResultStrip
  title="Last sync"
  :compact="true"
  :result="{ status: 'success', completedAt: lastRunAt, summary: '412 rows loaded' }"
/>
```
