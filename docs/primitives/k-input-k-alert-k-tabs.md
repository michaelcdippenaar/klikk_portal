# KInput / KAlert / KTabs — Primitive Reference

Finance-admin primitives. These replace the Quasar Material equivalents on all finance-admin surfaces. Targeting: Klikk Financials Portal reskin (Phase 1).

---

## KInput

**File:** `src/components/klikk/KInput.vue`

Replaces `q-input` with `outlined` + `dense` props.

### Why

Quasar's `q-input` ships Material Design chrome: a notched floating label, a ripple on focus, and an oversized 2px outline that shifts layout. These are Material tells. KInput uses a static label above the field, a 1px border with a box-shadow focus ring (no layout shift), and Geist 14px/500 for the value.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `modelValue` | String \| Number | `''` | v-model binding |
| `label` | String | null | Rendered above the input. Omit for unlabelled search inputs. |
| `type` | String | `'text'` | `'text'` \| `'password'` \| `'email'` \| `'number'` \| `'search'` \| `'tel'` \| `'url'` |
| `placeholder` | String | null | Placeholder text |
| `disabled` | Boolean | false | Disables the input |
| `error` | Boolean | false | Puts the field into error state (1px error border) |
| `errorMessage` | String | null | Error text shown below input when `error=true`. Sets `role="alert"`. |
| `helpText` | String | null | Helper text below input — hidden when `error=true` |
| `prefix` | String | null | Leading affix string, e.g. `"R"` for currency |
| `suffix` | String | null | Trailing affix string, e.g. `"ZAR"` |
| `icon` | String | null | Presence flag for a leading icon. Override glyph via the `#icon` slot. |

All additional HTML attributes (e.g. `autocomplete`, `maxlength`, `name`) pass through to the native `<input>` via `$attrs`.

### Slots

| Slot | Purpose |
|---|---|
| `#prefix` | Rich prefix content (e.g. a Lucide icon component). Overrides the `prefix` prop. |
| `#suffix` | Rich suffix content. Overrides the `suffix` prop. |
| `#icon` | Leading icon content. When `icon` prop is set, this slot renders the actual glyph. |

### States

| State | Visual |
|---|---|
| Default | 1px `--kdl-border` border, `--kdl-card-bg` background |
| Hover | Border lifts to `--kdl-text-muted` colour |
| Focus | Border → accent, `box-shadow: 0 0 0 2px rgba(255,61,127,0.18)` |
| Error | Border → `#ef4444` (danger-500), error ring on focus |
| Disabled | 50% opacity, not-allowed cursor |

### Sizing

- Height: **40px** (not 32px — this is the comfortable finance-admin minimum)
- Padding: **0 12px**
- Font: **14px / 500** for value, **13px / 500** for label
- Radius: **8px**

### Migration from `q-input`

```diff
- <q-input
-   v-model="email"
-   outlined
-   dense
-   label="Email"
-   :error="!!emailError"
-   :error-message="emailError"
- />
+ <KInput
+   v-model="email"
+   label="Email"
+   :error="!!emailError"
+   :error-message="emailError"
+ />
```

Key differences:
- Label is always above — never floating. Remove `label` from `q-input` if it was using the floating-label pattern and convert to a static `label` prop.
- `outlined` and `dense` props do not exist on KInput — the visual is always the KDL style.
- `hint` → `helpText` prop.
- `bottom-slots` / `no-error-icon` props: not applicable.

---

## KAlert

**File:** `src/components/klikk/KAlert.vue`

Replaces `q-banner` and inline Quasar tone classes (`bg-positive`, `bg-negative`, `bg-light-blue-1`).

### Why

Quasar banner colours are raw Material semantic tokens (`green-1`, `red-1`, etc.), not KDL tokens. They use a solid background fill that is too visually loud for inline alerts on data-dense pages. KAlert uses a 1px left accent bar + 8% tinted background — restrained but clearly semantic.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | String | `'info'` | `'info'` \| `'success'` \| `'warning'` \| `'error'` |
| `title` | String | null | Optional bold title above body text |
| `body` | String | null | Alert body text. Or use the default slot for rich content. |
| `dismissible` | Boolean | false | Shows an X button; clicking hides the component |
| `icon` | String | null | Override the auto-derived icon name (Lucide concept tokens: `'info'`, `'check-circle'`, `'alert-triangle'`, `'x-circle'`) |

### Slots

| Slot | Purpose |
|---|---|
| default | Rich body content (overrides the `body` prop) |

### Auto-derived icons

| Variant | Icon |
|---|---|
| `info` | Lucide `Info` (circle with i) |
| `success` | Lucide `CheckCircle` |
| `warning` | Lucide `AlertTriangle` |
| `error` | Lucide `XCircle` |

### Layout

- Padding: **12px 16px**
- Radius: **8px**
- Left bar: **1px** (not 4px — 4px is the Bootstrap 4 tell)
- Icon: **14px**, leading
- Title: **14px / 600**
- Body: **13px / 400 / 1.45**
- Dismiss X: **16px Lucide X** at far right

### Migration from `q-banner`

```diff
- <q-banner inline-actions class="bg-positive text-white">
-   Sync complete.
-   <template #action>
-     <q-btn flat label="Dismiss" v-close-popup />
-   </template>
- </q-banner>
+ <KAlert variant="success" body="Sync complete." dismissible />
```

```diff
- <q-banner class="bg-negative text-white">
-   <template #avatar>
-     <q-icon name="error" />
-   </template>
-   Connection failed.
- </q-banner>
+ <KAlert variant="error" title="Connection failed" body="Check credentials in Setup." />
```

Remove all `bg-positive`, `bg-negative`, `bg-warning`, `bg-light-blue-1` classes. They reference Quasar Material colour tokens, not KDL tokens.

---

## KTabs

**File:** `src/components/klikk/KTabs.vue`

Replaces `q-tabs` with Material animated underline indicator.

### Why

Quasar's `q-tabs` ships a Material ink-bar that animates between tabs. The animation is a Material tell. The font-weight active/inactive handling also diverges from KDL's 500/400 pattern. KTabs uses a static active state with no animation.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `tabs` | Array | required | Array of tab definitions (see shape below) |
| `modelValue` | String | null | Active tab slug (v-model) |
| `variant` | String | `'pills'` | `'pills'` (default) \| `'underline'` |
| `urlSync` | Boolean | true | Sync active tab with `?tab=<slug>` query param |
| `ariaLabel` | String | null | `aria-label` on the tablist element |

### Tab object shape

```js
{
  name: 'overview',    // Required — URL slug and v-model value
  label: 'Overview',   // Required — display text
  icon: 'list',        // Optional — icon token (see supported tokens below)
  count: 3,            // Optional — badge number shown on the tab
}
```

Supported icon tokens: `'layout-dashboard'`, `'list'`, `'bar-chart'`, `'settings'`, `'file-text'`. For other icons, wrap KTabs and inject via a slot extension pattern.

### Variants

**pills** (default, finance-admin): 32px tall pill items, 12px horizontal padding, 13px/500 text. Active pill: filled `--kdl-card-bg` background with a `--kdl-border` 1px ring and subtle shadow lift. Inactive: `--kdl-text-muted`. No animation.

**underline**: 32px tall, 1px `--kdl-border-subtle` bottom border on the container, `box-shadow: inset 0 -2px 0 var(--kdl-accent)` on the active tab (no layout shift). Use for document-like or content-first surfaces.

### URL sync

When `urlSync=true` (default), the component reads `route.query.tab` on mount and writes it on tab change. Tab slugs are validated against the `tabs` array; invalid slugs fall back to the first tab. The parent v-model also receives updates.

Set `:url-sync="false"` for embedded sub-panels where the URL should not change (e.g. a modal or a drawer with internal tabs).

The pattern follows the KDL `?tab=` structural rule — browser back moves between tabs, and bookmarks land on the right tab.

### Migration from `q-tabs`

```diff
- <q-tabs v-model="tab" align="left">
-   <q-tab name="overview" label="Overview" />
-   <q-tab name="journals" label="Journals" />
- </q-tabs>
- <q-tab-panels v-model="tab" animated>
-   <q-tab-panel name="overview">…</q-tab-panel>
-   <q-tab-panel name="journals">…</q-tab-panel>
- </q-tab-panels>
+ <KTabs
+   :tabs="[
+     { name: 'overview', label: 'Overview' },
+     { name: 'journals', label: 'Journals' },
+   ]"
+   v-model="tab"
+ />
+ <div v-if="tab === 'overview'">…</div>
+ <div v-if="tab === 'journals'">…</div>
```

Notes:
- `q-tab-panels` / `q-tab-panel` with the `animated` prop produce a slide/fade transition. KTabs does not animate panel content — use a simple `v-if` or `v-show` on the content panels. Routing is instant per KDL rules.
- `align="left"` is the default behaviour — KTabs items are left-aligned by default.
- The `q-tabs` `indicator-color` prop is not applicable. Use `variant="underline"` and the accent token drives the indicator colour.

---

## Preview route

Access all three primitives at `/_klikk-preview` during development (no auth required):

```
http://localhost:9000/_klikk-preview
```

Sections ⑥ KInput, ⑦ KAlert, and ⑧ KTabs are at the bottom of the page. Toggle light/dark with the button at the top right to verify both themes.
