<template>
  <aside class="overview-kpi-rail" aria-labelledby="overview-kpi-title">
    <header class="overview-kpi-rail__header">
      <div>
        <span class="overview-kpi-rail__eyebrow">Management KPIs</span>
        <h2 id="overview-kpi-title">Key performance</h2>
      </div>
      <span class="overview-kpi-rail__period">{{ period }}</span>
    </header>

    <div class="overview-kpi-rail__grid">
      <article v-for="kpi in kpis" :key="kpi.label" class="overview-kpi-card">
        <div class="overview-kpi-card__heading">
          <span>{{ kpi.label }}</span>
          <span class="overview-kpi-card__status" :class="`overview-tone--${kpi.tone || 'neutral'}`">
            <span class="overview-kpi-card__status-dot" aria-hidden="true" />
            {{ kpi.status }}
          </span>
        </div>
        <strong class="overview-kpi-card__value">{{ kpi.value }}</strong>
        <span class="overview-kpi-card__detail">{{ kpi.detail }}</span>
        <span class="overview-kpi-card__source">{{ kpi.source }}</span>
      </article>
    </div>

    <button type="button" class="overview-kpi-rail__action" @click="$emit('open-performance')">
      Open KPI detail
      <ArrowUpRight class="overview-kpi-rail__action-icon" aria-hidden="true" />
    </button>
  </aside>
</template>

<script setup>
import { ArrowUpRight } from 'lucide-vue-next';

defineProps({
  kpis: { type: Array, required: true },
  period: { type: String, required: true },
});
defineEmits(['open-performance']);
</script>
