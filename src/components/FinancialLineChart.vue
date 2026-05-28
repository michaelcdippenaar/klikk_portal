<template>
  <div class="financial-line-chart">
    <canvas ref="chartRef"></canvas>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
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
  markers: { type: Array, default: () => [] },
  highlightedMarkerKey: { type: String, default: '' },
});

const chartRef = ref(null);
let chartInstance = null;
let pointerListenersInstalled = false;

const dragMeasure = {
  active: false,
  startIndex: null,
  endIndex: null,
};

const MARKER_STYLES = {
  buy: {
    datasetId: 'buy-markers',
    label: 'Buy',
    color: 'rgb(22, 163, 74)',
    pointStyle: 'triangle',
    pointRotation: 0,
    radius: 12,
    hoverRadius: 16,
    borderWidth: 4,
    hoverBorderWidth: 5,
    hitRadius: 18,
    yOffset: 1,
  },
  sell: {
    datasetId: 'sell-markers',
    label: 'Sell',
    color: 'rgb(220, 38, 38)',
    pointStyle: 'triangle',
    pointRotation: 180,
    radius: 11,
    hoverRadius: 15,
    borderWidth: 3,
    hoverBorderWidth: 5,
    hitRadius: 18,
    yOffset: 1,
  },
  dividend: {
    datasetId: 'dividend-markers',
    label: 'Dividend',
    color: 'rgb(245, 158, 11)',
    pointStyle: 'rectRot',
    pointRotation: 0,
    radius: 8,
    hoverRadius: 11,
    yOffset: 1.015,
  },
  results: {
    datasetId: 'results-markers',
    label: 'Results',
    color: 'rgb(124, 58, 237)',
    pointStyle: 'rect',
    pointRotation: 0,
    radius: 8,
    hoverRadius: 11,
    yOffset: 0.985,
  },
  news: {
    datasetId: 'news-markers',
    label: 'News',
    color: 'rgb(14, 165, 233)',
    pointStyle: 'circle',
    pointRotation: 0,
    radius: 8,
    hoverRadius: 11,
    yOffset: 1.03,
  },
  market: {
    datasetId: 'market-markers',
    label: 'Market Event',
    color: 'rgb(220, 38, 38)',
    pointStyle: 'star',
    pointRotation: 0,
    radius: 13,
    hoverRadius: 17,
    yOffset: 1.1,
  },
};

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMarkerNumber(value, digits = 2) {
  const number = toFiniteNumber(value);
  if (number == null) return '—';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDividendMarkerLine(marker) {
  const amount = toFiniteNumber(marker.amount);
  const yieldPct = toFiniteNumber(marker.yield_pct);
  const priceOnDate = toFiniteNumber(marker.price_on_date);
  const dateLabel = marker.dateLabel ? `${marker.dateLabel}: ` : '';
  const originalDate = marker.date && marker.date !== marker.chartDate ? ` (${marker.date})` : '';
  const amountText = amount != null
    ? `${marker.currency ? `${marker.currency} ` : ''}${formatMarkerNumber(amount, 4)}`
    : 'amount —';
  const yieldText = yieldPct != null ? `Yield ${yieldPct.toFixed(2)}%` : 'Yield —';
  const priceText = priceOnDate != null ? `Price ${formatMarkerNumber(priceOnDate)}` : '';
  return [dateLabel + amountText, yieldText, priceText].filter(Boolean).join(' | ') + originalDate;
}

function getMarkerType(marker) {
  return marker?.type || marker?.kind || 'buy';
}

function isTradeMarkerType(type) {
  return type === 'buy' || type === 'sell';
}

function tradeMarkerLabel(type, markers) {
  if (type === 'sell') return 'Sell';
  return markers.some((marker) => marker.source === 'portfolio') ? 'Opening holding' : 'Buy';
}

function getMarkerStyle(type) {
  return MARKER_STYLES[type] || {
    datasetId: `${type}-markers`,
    label: type,
    color: 'rgb(100, 116, 139)',
    pointStyle: 'circle',
    pointRotation: 0,
    radius: 8,
    hoverRadius: 11,
    yOffset: 1,
  };
}

function markerKey(type, label) {
  return `${type}:${label}`;
}

function clampIndex(index) {
  if (!props.labels.length) return null;
  return Math.max(0, Math.min(props.labels.length - 1, index));
}

function closeAt(index) {
  const clampedIndex = clampIndex(index);
  if (clampedIndex == null) return null;
  return toFiniteNumber(props.data[clampedIndex]);
}

function eventToIndex(event) {
  if (!chartInstance || !chartRef.value || !props.labels.length) return null;
  const rect = chartRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const xScale = chartInstance.scales?.x;
  if (!xScale) return null;

  const rawIndex = xScale.getValueForPixel(x);
  if (!Number.isFinite(rawIndex)) return null;
  return clampIndex(Math.round(rawIndex));
}

function updateDragMeasure(event, options = {}) {
  const index = eventToIndex(event);
  if (index == null || closeAt(index) == null) return false;

  if (options.start) {
    dragMeasure.active = true;
    dragMeasure.startIndex = index;
  }
  dragMeasure.endIndex = index;
  chartInstance?.update('none');
  return true;
}

function startDragMeasure(event) {
  if (event.button != null && event.button !== 0) return;
  if (!props.labels.length || props.data.length < 2) return;
  if (!updateDragMeasure(event, { start: true })) return;
  event.preventDefault();
  chartRef.value?.setPointerCapture?.(event.pointerId);
}

function moveDragMeasure(event) {
  if (!dragMeasure.active) return;
  updateDragMeasure(event);
  event.preventDefault();
}

function finishDragMeasure(event) {
  if (!dragMeasure.active) return;
  updateDragMeasure(event);
  dragMeasure.active = false;
  if (dragMeasure.startIndex === dragMeasure.endIndex) {
    dragMeasure.startIndex = null;
    dragMeasure.endIndex = null;
  }
  chartRef.value?.releasePointerCapture?.(event.pointerId);
  chartInstance?.update('none');
}

function clearDragMeasure() {
  dragMeasure.active = false;
  dragMeasure.startIndex = null;
  dragMeasure.endIndex = null;
  chartInstance?.update('none');
}

function formatMeasurePercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function installPointerListeners() {
  const canvas = chartRef.value;
  if (!canvas || pointerListenersInstalled) return;
  pointerListenersInstalled = true;
  canvas.addEventListener('pointerdown', startDragMeasure);
  canvas.addEventListener('pointermove', moveDragMeasure);
  canvas.addEventListener('pointerup', finishDragMeasure);
  canvas.addEventListener('pointercancel', finishDragMeasure);
  canvas.addEventListener('dblclick', clearDragMeasure);
}

function removePointerListeners() {
  const canvas = chartRef.value;
  if (!canvas || !pointerListenersInstalled) return;
  pointerListenersInstalled = false;
  canvas.removeEventListener('pointerdown', startDragMeasure);
  canvas.removeEventListener('pointermove', moveDragMeasure);
  canvas.removeEventListener('pointerup', finishDragMeasure);
  canvas.removeEventListener('pointercancel', finishDragMeasure);
  canvas.removeEventListener('dblclick', clearDragMeasure);
}

const dragMeasurePlugin = {
  id: 'dragMeasure',
  afterDatasetsDraw(chart) {
    if (dragMeasure.startIndex == null || dragMeasure.endIndex == null) return;

    const startValue = closeAt(dragMeasure.startIndex);
    const endValue = closeAt(dragMeasure.endIndex);
    if (startValue == null || endValue == null || !startValue) return;

    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;

    const startX = xScale.getPixelForValue(dragMeasure.startIndex);
    const endX = xScale.getPixelForValue(dragMeasure.endIndex);
    const startY = yScale.getPixelForValue(startValue);
    const endY = yScale.getPixelForValue(endValue);
    const change = endValue - startValue;
    const pct = (change / startValue) * 100;
    const isPositive = pct >= 0;
    const color = isPositive ? 'rgb(22, 163, 74)' : 'rgb(185, 28, 28)';
    const label = `${formatMeasurePercent(pct)}  ${startValue.toFixed(2)} → ${endValue.toFixed(2)}`;
    const dateLabel = `${props.labels[dragMeasure.startIndex]} → ${props.labels[dragMeasure.endIndex]}`;

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(startX, chartArea.top);
    ctx.lineTo(startX, chartArea.bottom);
    ctx.moveTo(endX, chartArea.top);
    ctx.lineTo(endX, chartArea.bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(startX, startY, 4, 0, Math.PI * 2);
    ctx.arc(endX, endY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '700 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const labelWidth = Math.max(ctx.measureText(label).width, ctx.measureText(dateLabel).width);
    const boxWidth = labelWidth + 18;
    const boxHeight = 42;
    let boxX = (startX + endX) / 2 - boxWidth / 2;
    boxX = Math.max(chartArea.left + 4, Math.min(chartArea.right - boxWidth - 4, boxX));
    const minY = Math.min(startY, endY);
    let boxY = minY - boxHeight - 12;
    if (boxY < chartArea.top + 4) {
      boxY = Math.max(chartArea.top + 4, Math.max(startY, endY) + 12);
    }

    ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.fillText(label, boxX + 9, boxY + 17);
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.74)';
    ctx.fillText(dateLabel, boxX + 9, boxY + 34);
    ctx.restore();
  },
};

function buildChart() {
  if (!chartRef.value || !props.labels.length) return;
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  clearDragMeasure();

  const priceLineWidth = props.labels.length > 260 ? 1.5 : 2;
  const labelSet = new Set(props.labels);
  const markerMap = new Map();
  const markerTypes = [];
  const markerTypeSet = new Set();
  const resolveMarkerLabel = (date) => {
    if (!date) return null;
    if (labelSet.has(date)) return date;

    const markerTime = new Date(`${date}T00:00:00`).getTime();
    if (!Number.isFinite(markerTime)) return null;

    const nextLabel = props.labels.find((label) => {
      const labelTime = new Date(`${label}T00:00:00`).getTime();
      return Number.isFinite(labelTime) && labelTime >= markerTime;
    });
    if (nextLabel) return nextLabel;

    let nearestLabel = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const label of props.labels) {
      const labelTime = new Date(`${label}T00:00:00`).getTime();
      if (!Number.isFinite(labelTime)) continue;
      const distance = Math.abs(labelTime - markerTime);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLabel = label;
      }
    }
    return nearestLabel;
  };

  for (const marker of props.markers || []) {
    const targetLabel = resolveMarkerLabel(marker?.date);
    if (!targetLabel) continue;
    const type = getMarkerType(marker);
    if (!markerTypeSet.has(type)) {
      markerTypeSet.add(type);
      markerTypes.push(type);
    }
    const key = markerKey(type, targetLabel);
    const labelMarkers = markerMap.get(key) || [];
    labelMarkers.push(marker);
    markerMap.set(key, labelMarkers);
  }

  const buildMarkerData = (type) => props.labels.map((label, index) => {
    const labelMarkers = markerMap.get(`${type}:${label}`);
    if (!labelMarkers?.length) return null;

    const weighted = labelMarkers.reduce((acc, marker) => {
      const quantity = toFiniteNumber(marker.quantity) || 0;
      const price = toFiniteNumber(marker.price);
      if (quantity > 0 && price != null) {
        acc.quantity += quantity;
        acc.value += quantity * price;
      }
      return acc;
    }, { quantity: 0, value: 0 });
    const weightedPrice = weighted.quantity > 0 ? weighted.value / weighted.quantity : null;
    const firstMarkerPrice = toFiniteNumber(labelMarkers[0]?.price);
    const closePrice = toFiniteNumber(props.data[index]);
    const style = getMarkerStyle(type);
    if (weightedPrice != null) return weightedPrice;
    if (firstMarkerPrice != null) return firstMarkerPrice;
    return closePrice != null ? closePrice * style.yOffset : null;
  });

  const datasets = [
    {
      label: 'Close',
      data: props.data,
      borderColor: 'rgb(26, 115, 232)',
      backgroundColor: 'rgba(26, 115, 232, 0.1)',
      borderWidth: priceLineWidth,
      fill: true,
      tension: 0.2,
      pointRadius: 0,
      pointHoverRadius: 4,
    },
  ];

  for (const type of markerTypes) {
    const style = getMarkerStyle(type);
    const markerData = buildMarkerData(type);
    if (!markerData.some((value) => value != null)) continue;
    const pointRadius = markerData.map((value, index) => {
      if (value == null) return 0;
      return props.highlightedMarkerKey === markerKey(type, props.labels[index])
        ? style.radius + 7
        : style.radius;
    });
    const pointHoverRadius = markerData.map((value, index) => {
      if (value == null) return 0;
      return props.highlightedMarkerKey === markerKey(type, props.labels[index])
        ? style.hoverRadius + 7
        : style.hoverRadius;
    });
    const pointBorderColor = markerData.map((value, index) => (
      value != null && props.highlightedMarkerKey === markerKey(type, props.labels[index])
        ? 'rgb(17, 24, 39)'
        : 'rgba(255, 255, 255, 0.95)'
    ));
    const pointBorderWidth = markerData.map((value, index) => (
      value != null && props.highlightedMarkerKey === markerKey(type, props.labels[index])
        ? (style.hoverBorderWidth || 4)
        : (style.borderWidth || 2)
    ));
    datasets.push({
      id: style.datasetId,
      markerType: type,
      label: style.label,
      data: markerData,
      borderColor: style.color,
      backgroundColor: style.color,
      pointBorderColor,
      pointBorderWidth,
      pointHoverBorderColor: 'rgba(255, 255, 255, 1)',
      pointHoverBorderWidth: style.hoverBorderWidth || 3,
      fill: false,
      showLine: false,
      pointRadius,
      pointHoverRadius,
      pointStyle: style.pointStyle,
      pointRotation: style.pointRotation,
      pointHitRadius: style.hitRadius || 14,
    });
  }

  chartInstance = new Chart(chartRef.value, {
    type: 'line',
    data: {
      labels: props.labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label(context) {
              const rawValue = context.parsed?.y ?? context.raw;
              const value = toFiniteNumber(rawValue);
              const markerType = context.dataset?.markerType;
              if (isTradeMarkerType(markerType)) {
                const date = props.labels[context.dataIndex];
                const trades = markerMap.get(`${markerType}:${date}`) || [];
                const quantity = trades.reduce((sum, marker) => sum + (toFiniteNumber(marker.quantity) || 0), 0);
                const displayWeighted = trades.reduce((acc, marker) => {
                  const markerQuantity = toFiniteNumber(marker.quantity) || 0;
                  const markerPrice = toFiniteNumber(marker.display_price ?? marker.price);
                  if (markerQuantity > 0 && markerPrice != null) {
                    acc.quantity += markerQuantity;
                    acc.value += markerQuantity * markerPrice;
                  }
                  return acc;
                }, { quantity: 0, value: 0 });
                const displayPrice = displayWeighted.quantity > 0 ? displayWeighted.value / displayWeighted.quantity : value;
                const quantityText = quantity ? `${quantity.toLocaleString()} shares` : 'shares';
                const label = tradeMarkerLabel(markerType, trades);
                return `${label}: ${quantityText}${displayPrice != null ? ` @ ${displayPrice.toFixed(2)}` : ''}`;
              }
              if (context.dataset?.markerType === 'dividend') {
                const date = props.labels[context.dataIndex];
                const events = markerMap.get(`dividend:${date}`) || [];
                const total = events.reduce((sum, marker) => sum + (toFiniteNumber(marker.amount) || 0), 0);
                const currency = events.find((marker) => marker.currency)?.currency || '';
                const yieldValues = events
                  .map((marker) => toFiniteNumber(marker.yield_pct))
                  .filter((value) => value != null);
                const yieldText = yieldValues.length === 1 ? `, yield ${yieldValues[0].toFixed(2)}%` : '';
                return `Dividend: ${total ? `${currency ? `${currency} ` : ''}${formatMarkerNumber(total, 4)}` : `${events.length} event${events.length === 1 ? '' : 's'}`}${yieldText}`;
              }
              if (context.dataset?.markerType === 'results') {
                const date = props.labels[context.dataIndex];
                const events = markerMap.get(`results:${date}`) || [];
                return `Results: ${events.length} period${events.length === 1 ? '' : 's'}`;
              }
              if (context.dataset?.markerType === 'news') {
                const date = props.labels[context.dataIndex];
                const events = markerMap.get(`news:${date}`) || [];
                return `News: ${events.length} item${events.length === 1 ? '' : 's'}`;
              }
              if (context.dataset?.markerType === 'market') {
                const date = props.labels[context.dataIndex];
                const events = markerMap.get(`market:${date}`) || [];
                return `Major market event: ${events.length} announcement${events.length === 1 ? '' : 's'}`;
              }
              return `Close: ${value != null ? value.toFixed(2) : '—'}`;
            },
            afterLabel(context) {
              const date = props.labels[context.dataIndex];
              const markerType = context.dataset?.markerType;
              if (isTradeMarkerType(markerType)) {
                const trades = markerMap.get(`${markerType}:${date}`) || [];
                return trades.slice(0, 3).map((marker) => {
                  const quantity = toFiniteNumber(marker.quantity);
                  const price = toFiniteNumber(marker.display_price ?? marker.price);
                  const shareName = marker.share_name ? `${marker.share_name} ` : '';
                  const prefix = tradeMarkerLabel(markerType, [marker]) + ': ';
                  const originalDate = marker.date && marker.date !== date ? ` (${marker.date})` : '';
                  return `${prefix}${shareName}${quantity != null ? quantity.toLocaleString() : '—'} @ ${price != null ? price.toFixed(2) : '—'}${originalDate}`;
                });
              }
              if (context.dataset?.markerType === 'dividend') {
                const events = markerMap.get(`dividend:${date}`) || [];
                return events.slice(0, 3).map((marker) => {
                  return formatDividendMarkerLine({ ...marker, chartDate: date });
                });
              }
              if (context.dataset?.markerType === 'results') {
                const events = markerMap.get(`results:${date}`) || [];
                return events.slice(0, 3).map((marker) => {
                  const label = marker.period || marker.statement_type || 'Financial result';
                  const originalDate = marker.date && marker.date !== date ? ` (${marker.date})` : '';
                  return `${label}${originalDate}`;
                });
              }
              if (context.dataset?.markerType === 'news') {
                const events = markerMap.get(`news:${date}`) || [];
                return events.slice(0, 3).map((marker) => {
                  const publisher = marker.publisher ? `${marker.publisher}: ` : '';
                  const title = marker.title || 'News';
                  const originalDate = marker.date && marker.date !== date ? ` (${marker.date})` : '';
                  return `${publisher}${title}${originalDate}`;
                });
              }
              if (context.dataset?.markerType === 'market') {
                const events = markerMap.get(`market:${date}`) || [];
                return events.slice(0, 3).map((marker) => {
                  const publisher = marker.publisher ? `${marker.publisher}: ` : '';
                  const title = marker.title || 'Market event';
                  const originalDate = marker.date && marker.date !== date ? ` (${marker.date})` : '';
                  return `${publisher}${title}${originalDate}`;
                });
              }
              return [];
            },
          },
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
    plugins: [dragMeasurePlugin],
  });
}

watch(
  () => [props.labels, props.data, props.markers, props.highlightedMarkerKey],
  () => buildChart(),
  { deep: true }
);

onMounted(() => {
  installPointerListeners();
  buildChart();
});

onBeforeUnmount(() => {
  removePointerListeners();
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
});
</script>

<style scoped>
.financial-line-chart {
  height: 280px;
  width: 100%;
}

.financial-line-chart canvas {
  cursor: crosshair;
  touch-action: none;
}
</style>
