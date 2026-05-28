<!--
  KLockup — Klikk Financials brand lockup (Tally mark + wordmark).

  Single source of truth for the inline SVG brand asset. Use this everywhere
  the lockup appears so brand changes propagate automatically.

  Props:
    size  'sm' | 'md' | 'lg'   default 'md'
          sm = 20px tall (favicon-adjacent uses)
          md = 24px tall (header default)
          lg = 36px tall (login page, marketing surfaces)

  The SVG uses currentColor for all fill values — inherit text-token from parent.

  USAGE:
    KLockup                  md, inherits colour
    KLockup size="lg"        36px login variant
    KLockup size="sm"        20px compact variant
-->
<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="viewBox"
    :class="['klockup', `klockup--${size}`]"
    aria-hidden="true"
    focusable="false"
  >
    <!-- ── sm: 20px tall — proportional to original 24px md ── -->
    <template v-if="size === 'sm'">
      <!-- Tally mark: three bars at 20px height -->
      <rect x="0" y="3" width="11" height="3.5" rx="1.5" fill="currentColor" />
      <rect x="0" y="8" width="8"  height="3.5" rx="1.5" fill="currentColor" />
      <rect x="0" y="13" width="5" height="3.5" rx="1.5" fill="currentColor" />
      <!-- "klikk" — 15px / 600 -->
      <text
        x="18"
        y="16"
        font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
        font-size="15"
        font-weight="600"
        letter-spacing="-0.38"
        fill="currentColor"
      >klikk</text>
      <!-- "financials" — 10px / 500 / 60% opacity -->
      <text
        x="73"
        y="16"
        font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
        font-size="10"
        font-weight="500"
        letter-spacing="0.4"
        fill="currentColor"
        opacity="0.6"
      >financials</text>
    </template>

    <!-- ── md: 24px tall — header default ── -->
    <template v-else-if="size === 'md'">
      <!-- Tally mark: three bars proportional to 24px tall lockup -->
      <rect x="0" y="4" width="14" height="4"   rx="1.5" fill="currentColor" />
      <rect x="0" y="10" width="10" height="4"  rx="1.5" fill="currentColor" />
      <rect x="0" y="16" width="6"  height="4"  rx="1.5" fill="currentColor" />
      <!-- "klikk" — 18px / 600 -->
      <text
        x="22"
        y="19"
        font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
        font-size="18"
        font-weight="600"
        letter-spacing="-0.45"
        fill="currentColor"
      >klikk</text>
      <!-- "financials" — 13px / 500 / 60% opacity -->
      <text
        x="87"
        y="19"
        font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
        font-size="13"
        font-weight="500"
        letter-spacing="0.5"
        fill="currentColor"
        opacity="0.6"
      >financials</text>
    </template>

    <!-- ── lg: 36px tall — login / marketing ── -->
    <template v-else>
      <!-- Tally mark proportional to 36px tall lockup -->
      <rect x="0" y="5"  width="18" height="5.5" rx="2" fill="currentColor" />
      <rect x="0" y="13" width="13" height="5.5" rx="2" fill="currentColor" />
      <rect x="0" y="21" width="8"  height="5.5" rx="2" fill="currentColor" />
      <!-- "klikk" — 28px / 600 -->
      <text
        x="26"
        y="30"
        font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
        font-size="28"
        font-weight="600"
        letter-spacing="-0.7"
        fill="currentColor"
      >klikk</text>
      <!-- "financials" — 18px / 500 / 60% opacity -->
      <text
        x="132"
        y="30"
        font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
        font-size="18"
        font-weight="500"
        letter-spacing="0.5"
        fill="currentColor"
        opacity="0.6"
      >financials</text>
    </template>
  </svg>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  /**
   * Height tier for the lockup.
   *   sm = 20px  (favicon-adjacent, compact surfaces)
   *   md = 24px  (header default)
   *   lg = 36px  (login page, marketing)
   */
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v),
  },
});

// viewBox dimensions match the original inline SVGs per size tier.
// md uses 196×24 (from MainLayout). lg uses 240×36 (from Login).
// sm is proportionally derived.
const viewBox = computed(() => {
  if (props.size === 'sm') return '0 0 165 20';
  if (props.size === 'lg') return '0 0 240 36';
  return '0 0 196 24';
});
</script>

<style scoped>
.klockup {
  display: block;
  width: auto;
  flex-shrink: 0;
}

.klockup--sm { height: 20px; }
.klockup--md { height: 24px; }
.klockup--lg { height: 36px; }
</style>
