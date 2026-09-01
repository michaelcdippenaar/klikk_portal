<template>
  <div class="overview-summary-view">
    <header class="overview-summary-view__header">
      <div>
        <span class="overview-summary-view__eyebrow">{{ config.eyebrow }}</span>
        <h1>{{ config.title }}</h1>
        <p>{{ config.description }}</p>
      </div>
      <span class="overview-summary-view__period">{{ period }}</span>
    </header>

    <OverviewMetricGrid v-if="config.showMetrics !== false" :metrics="config.metrics" />
    <OverviewTablePanel :table="config.table" @open="$emit('open', $event)" />
  </div>
</template>

<script setup>
import OverviewMetricGrid from './OverviewMetricGrid.vue';
import OverviewTablePanel from './OverviewTablePanel.vue';

defineProps({
  config: { type: Object, required: true },
  period: { type: String, required: true },
});
defineEmits(['open']);
</script>
