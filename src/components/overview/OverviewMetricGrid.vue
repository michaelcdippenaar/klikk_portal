<template>
  <section class="overview-metrics" aria-label="Overview metrics">
    <article v-for="metric in metrics" :key="metric.label" class="overview-metric">
      <span class="overview-metric__label">{{ metric.label }}</span>
      <strong class="overview-metric__value" :class="`overview-tone--${metric.tone || 'neutral'}`">{{ metric.value }}</strong>
      <span class="overview-metric__detail">{{ metric.detail }}</span>
    </article>
  </section>
</template>

<script setup>
defineProps({ metrics: { type: Array, required: true } });
</script>
