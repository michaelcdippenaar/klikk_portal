<template>
  <div class="financial-line-chart">
    <canvas ref="chartRef"></canvas>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

const props = defineProps({
  labels: { type: Array, default: () => [] },
  data: { type: Array, default: () => [] },
});

const chartRef = ref(null);
let chartInstance = null;

function buildChart() {
  if (!chartRef.value || !props.labels.length) return;
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  chartInstance = new Chart(chartRef.value, {
    type: 'line',
    data: {
      labels: props.labels,
      datasets: [
        {
          label: 'Close',
          data: props.data,
          borderColor: 'rgb(26, 115, 232)',
          backgroundColor: 'rgba(26, 115, 232, 0.1)',
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
        },
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: { maxTicksLimit: 8 },
        },
        y: {
          display: true,
          position: 'right',
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: { maxTicksLimit: 6 },
        },
      },
    },
  });
}

watch(
  () => [props.labels, props.data],
  () => buildChart(),
  { deep: true }
);

onMounted(() => buildChart());
</script>

<style scoped>
.financial-line-chart {
  height: 280px;
  width: 100%;
}
</style>
