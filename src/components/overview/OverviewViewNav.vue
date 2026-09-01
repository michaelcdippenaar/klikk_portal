<template>
  <nav class="overview-view-nav" aria-label="Overview views">
    <button
      v-for="view in views"
      :key="view.key"
      type="button"
      class="overview-view-nav__item"
      :class="{ 'overview-view-nav__item--active': view.key === modelValue }"
      :aria-current="view.key === modelValue ? 'page' : undefined"
      @click="$emit('update:modelValue', view.key)"
    >
      <component :is="iconFor(view.icon)" class="overview-view-nav__icon" aria-hidden="true" />
      <span>{{ view.label }}</span>
      <span v-if="view.count" class="overview-view-nav__count">{{ view.count }}</span>
    </button>
  </nav>
</template>

<script setup>
import { Gauge, LineChart } from 'lucide-vue-next';

defineProps({
  views: { type: Array, required: true },
  modelValue: { type: String, required: true },
});
defineEmits(['update:modelValue']);

const ICONS = { close: Gauge, performance: LineChart };
function iconFor(key) { return ICONS[key] || Gauge; }
</script>
