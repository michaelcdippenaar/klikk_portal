<template>
  <section class="ingest-widgets" aria-labelledby="ingest-widgets-title">
    <header class="ingest-widgets__header">
      <div class="ingest-widgets__title-row">
        <h2 id="ingest-widgets-title" class="section-header">{{ title }}</h2>
        <span class="ingest-widgets__count" :aria-label="`${attentionCount} source jobs need attention`">{{ attentionCount }}</span>
      </div>
      <p>{{ description }}</p>
    </header>

    <div class="ingest-widgets__grid">
      <article v-for="item in items" :key="item.id" class="ingest-widget" :class="`ingest-widget--${item.statusTone}`">
        <header class="ingest-widget__header">
          <span class="ingest-widget__brand" :class="{ 'ingest-widget__brand--vendor': item.vendor }" aria-hidden="true">
            <img v-if="vendorLogo(item.vendor)" :src="vendorLogo(item.vendor)" :class="`ingest-widget__vendor-logo ingest-widget__vendor-logo--${item.vendor}`" alt="" />
            <component :is="iconFor(item.icon)" v-else />
          </span>
          <span class="ingest-widget__status" :class="`ingest-widget__status--${item.statusTone}`">
            <span aria-hidden="true" />{{ item.status }}
          </span>
        </header>

        <div class="ingest-widget__title">
          <h3>{{ item.label }}</h3>
          <p>{{ item.source }} · {{ item.mode }}</p>
        </div>

        <div class="ingest-widget__metric">
          <span>{{ metricLabel(item) }}</span>
          <strong>{{ item.recordsLabel }}</strong>
        </div>

        <dl class="ingest-widget__facts">
          <div>
            <dt>Last update</dt>
            <dd>{{ item.freshnessLabel }}</dd>
          </div>
          <div>
            <dt>Validation</dt>
            <dd>{{ item.validationLabel }}</dd>
          </div>
        </dl>

        <button type="button" class="ingest-widget__open" :aria-label="`Open ${item.label}`" @click="$emit('open', item)">
          {{ item.actionLabel || 'View source' }} <ChevronRight aria-hidden="true" />
        </button>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import {
  Database, Landmark, LineChart, Mail, MessageSquareText, PenLine, ReceiptText, Upload, ChevronRight,
} from 'lucide-vue-next';
import xeroLogo from '../../assets/vendors/xero-logo';
import investecLogo from '../../assets/vendors/investec-logo.svg';
import ibmPlanningAnalyticsLogo from '../../assets/vendors/ibm-planning-analytics.svg';
import whatsappLogo from '../../assets/vendors/whatsapp-glyph-green.svg';

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  items: { type: Array, required: true },
});
defineEmits(['open']);

const attentionCount = computed(() => props.items.filter((item) => item.statusTone === 'warning').length);
const VENDOR_LOGOS = {
  xero: xeroLogo,
  investec: investecLogo,
  ibm: ibmPlanningAnalyticsLogo,
  whatsapp: whatsappLogo,
};
const ICONS = {
  bank: Landmark,
  database: Database,
  holdings: LineChart,
  mail: Mail,
  message: MessageSquareText,
  planning: LineChart,
  transactions: PenLine,
  upload: Upload,
};
const METRIC_LABELS = {
  bank: 'Imported transactions',
  database: 'Ledger population',
  holdings: 'Current holdings',
  mail: 'Documents received',
  message: 'Receipts received',
  planning: 'Target version',
  transactions: 'Share transactions',
  upload: 'Pending uploads',
};

function iconFor(key) { return ICONS[key] || ReceiptText; }
function metricLabel(item) { return METRIC_LABELS[item.icon] || 'Records'; }
function vendorLogo(vendor) { return VENDOR_LOGOS[vendor] || null; }
</script>
