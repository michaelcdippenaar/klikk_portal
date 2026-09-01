<template>
  <section class="reporting-kpi-report" aria-label="Performance KPI report">
    <OverviewMetricGrid :metrics="kpis" />
    <OverviewTablePanel :table="varianceTable" />
  </section>
</template>

<script setup>
import OverviewMetricGrid from '../overview/OverviewMetricGrid.vue';
import OverviewTablePanel from '../overview/OverviewTablePanel.vue';

defineProps({
  kpis: { type: Array, required: true },
  varianceTable: { type: Object, required: true },
});
</script>
