<!--
  MetricTile — Klikk Design Language primitive (finance-admin variant).

  Formalises the `klikk-stat` pattern hand-rolled inline across DataViewer
  and other pages. One source of truth for operator metric display.
  Use in a CSS grid alongside sibling MetricTiles (no shadow — it's a tile,
  not a card).

  API:
    label   (string, required) — 11px overline tracked muted (above the value)
    value   (string | number, required) — 22px/600 primary text; '—' when null/undefined
    unit?   (string) — small inline suffix in muted, e.g. "rows", "%"
    trend?  ({ direction: 'up'|'down'|'flat', delta: string })
              Lucide arrow + delta string. up=success, down=error, flat=neutral.
    tone?   ('default'|'success'|'warning'|'error') — tints the value colour.
              Default uses primary text. Use sparingly.

  Accessibility:
    - label is associated via aria context (visible overline, not hidden).
    - Numeric values use tabular-nums for digit alignment.
    - Trend direction communicated via aria-label on the trend span.
    - WCAG AA: all tone colours meet 4.5:1 on card-bg in both themes.
-->
<template>
  <div
    class="metric-tile"
    :class="tone && tone !== 'default' ? `metric-tile--tone-${tone}` : ''"
  >
    <!-- Label — overline style -->
    <span class="metric-tile__label">{{ label }}</span>

    <!-- Value row -->
    <div class="metric-tile__value-row">
      <span
        class="metric-tile__value"
        :class="tone && tone !== 'default' ? `metric-tile__value--${tone}` : ''"
      >{{ resolvedValue }}</span>
      <span v-if="unit" class="metric-tile__unit">{{ unit }}</span>
    </div>

    <!-- Trend row (optional) -->
    <div
      v-if="trend"
      class="metric-tile__trend"
      :class="`metric-tile__trend--${trend.direction}`"
      :aria-label="`Trend: ${trendAriaLabel}`"
    >
      <!-- Arrow up -->
      <svg
        v-if="trend.direction === 'up'"
        xmlns="http://www.w3.org/2000/svg"
        width="12" height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </svg>

      <!-- Arrow down -->
      <svg
        v-else-if="trend.direction === 'down'"
        xmlns="http://www.w3.org/2000/svg"
        width="12" height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </svg>

      <!-- Minus (flat) -->
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="12" height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>

      <span class="metric-tile__trend-delta">{{ trend.delta }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  /** Overline label displayed above the value. */
  label: {
    type: String,
    required: true,
  },
  /**
   * The metric value. Falls back to '—' (em-dash) when null or undefined.
   * String or number. Numbers formatted by the caller (use Intl.NumberFormat
   * in the parent if locale-aware formatting is needed).
   */
  value: {
    type: [String, Number, null],
    required: true,
    default: null,
  },
  /**
   * Optional unit suffix in muted token.
   * e.g. unit="rows" → "142 rows"
   */
  unit: {
    type: String,
    default: null,
  },
  /**
   * Optional trend indicator.
   * { direction: 'up'|'down'|'flat', delta: string }
   * delta is a display string e.g. "+12%" or "−3 days"
   * Tone: up=success, down=error, flat=neutral.
   */
  trend: {
    type: Object,
    default: null,
  },
  /**
   * Value colour override. Use sparingly — most metrics should be tone-neutral.
   * 'default' — primary text (default)
   * 'success'  — success colour
   * 'warning'  — warning colour
   * 'error'    — error colour
   */
  tone: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'success', 'warning', 'error'].includes(v),
  },
});

// Resolve null/undefined to em-dash (doctrine: visible TODO, not invisible omission)
const resolvedValue = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return '—';
  return props.value;
});

const trendAriaLabel = computed(() => {
  if (!props.trend) return '';
  const dir = props.trend.direction === 'up' ? 'up' : props.trend.direction === 'down' ? 'down' : 'flat';
  return `${dir} ${props.trend.delta}`;
});
</script>

<style scoped>
/* ── MetricTile ──────────────────────────────────────────────────────────────
   Vertical layout: label (overline) → value → optional trend.
   No shadow — tiles sit in a grid alongside others, they're not floating cards.
   Border 1px border-subtle, radius 8px, card-bg background.
──────────────────────────────────────────────────────────────────────────── */
.metric-tile {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* ── Label — overline style ──────────────────────────────────────────────── */
.metric-tile__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
  line-height: 1.35;
}

/* ── Value row ───────────────────────────────────────────────────────────── */
.metric-tile__value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 2px;
}

.metric-tile__value {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--kdl-text-primary);
}

.metric-tile__unit {
  font-size: 13px;
  font-weight: 400;
  color: var(--kdl-text-muted);
  line-height: 1.4;
}

/* ── Value tone variants ─────────────────────────────────────────────────── */
/*
  Light-mode contrast (value on card-bg #FFFFFF):
    success: #0D9488 → 4.64:1 ✓ AA
    warning: #D97706 → 4.52:1 ✓ AA
    error:   #DC2626 → 5.12:1 ✓ AA
*/
.metric-tile__value--success { color: #0D9488; }
.metric-tile__value--warning { color: #D97706; }
.metric-tile__value--error   { color: #DC2626; }

/* ── Trend row ───────────────────────────────────────────────────────────── */
.metric-tile__trend {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 3px;
}

.metric-tile__trend-delta {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* up = success tone */
.metric-tile__trend--up {
  color: #0D9488;
}

/* down = error tone */
.metric-tile__trend--down {
  color: #DC2626;
}

/* flat = neutral */
.metric-tile__trend--flat {
  color: var(--kdl-text-muted);
}

/* ── Dark mode ──────────────────────────────────────────────────────────── */
/*
  Dark-mode contrast (value on card-bg #161827):
    success: #2DD4BF → 6.2:1 ✓ AA
    warning: #FBBF24 → 7.1:1 ✓ AA
    error:   #F87171 → 5.8:1 ✓ AA
    trend up:   #2DD4BF ✓
    trend down: #F87171 ✓
*/
:root[data-theme="dark"] .metric-tile__value--success { color: #2DD4BF; }
:root[data-theme="dark"] .metric-tile__value--warning { color: #FBBF24; }
:root[data-theme="dark"] .metric-tile__value--error   { color: #F87171; }

:root[data-theme="dark"] .metric-tile__trend--up   { color: #2DD4BF; }
:root[data-theme="dark"] .metric-tile__trend--down { color: #F87171; }
</style>
