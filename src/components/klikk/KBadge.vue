<!--
  KBadge — Klikk Design Language count / label / metadata primitive.

  Replaces: q-badge for non-status uses.
  Distinct from StatusPill (operational state) and KChip (removable filter pills).
  KBadge is for static metadata: counts ("12 new"), version labels ("v2.4"),
  feature flags ("BETA"), environment indicators ("STAGING"), etc.

  API:
    label   (string, required)
    tone?   ('default' | 'accent' | 'muted') — colour scheme. Default 'default'.
    size?   ('sm' | 'md') — sm = 10px 2/6px padding, md = 11px 3/8px padding. Default 'md'.

  No icon variant: badges are tight inline labels. If you need an icon, use
  StatusPill (semantic state) or KChip (interactive filter).

  Accessibility:
    - Renders as <span> — purely presentational, reads as inline text.
    - No ARIA role added; surrounding context must supply meaning.
-->
<template>
  <span
    class="kbadge"
    :class="[`kbadge--${tone}`, `kbadge--${size}`]"
  >{{ label }}</span>
</template>

<script setup>
defineProps({
  /** The text displayed inside the badge (count, label, version, etc.). */
  label: {
    type: String,
    required: true,
  },
  /**
   * Colour tone:
   *   'default' — border-subtle background + text-secondary (neutral, most contexts)
   *   'accent'  — 10% accent tint background + accent text (highlights, new counts)
   *   'muted'   — muted background + text-hint (de-emphasised metadata)
   */
  tone: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'accent', 'muted'].includes(v),
  },
  /**
   * Size variant:
   *   'sm' — 10px font, 2px 6px padding (table cells, tight inline)
   *   'md' — 11px font, 3px 8px padding (default: cards, headers)
   */
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v),
  },
});
</script>

<style scoped>
/* ── KBadge ──────────────────────────────────────────────────────────────────
   4px radius — less rounded than KChip (fully-rounded) and StatusPill (6px).
   Weight 500 for legibility at micro sizes. No border — tint background only.
──────────────────────────────────────────────────────────────────────────── */
.kbadge {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  vertical-align: middle;
  letter-spacing: 0.02em;
}

/* ── Size variants ───────────────────────────────────────────────────────── */
.kbadge--sm {
  font-size: 10px;
  padding: 2px 6px;
}

.kbadge--md {
  font-size: 11px;
  padding: 3px 8px;
}

/* ── Tone variants — light mode ──────────────────────────────────────────── */
.kbadge--default {
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
}

.kbadge--accent {
  background: rgba(255, 61, 127, 0.10);
  color: var(--kdl-accent);
}

.kbadge--muted {
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-hint);
}

/* ── Dark mode overrides ─────────────────────────────────────────────────── */
:root[data-theme="dark"] .kbadge--default {
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
}

:root[data-theme="dark"] .kbadge--accent {
  background: rgba(255, 79, 138, 0.12);
  color: var(--kdl-accent);
}

:root[data-theme="dark"] .kbadge--muted {
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-hint);
}
</style>
