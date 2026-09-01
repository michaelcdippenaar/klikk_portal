<template>
  <section class="ingest-work" aria-labelledby="ingest-work-title">
    <header class="ingest-work__header">
      <div class="ingest-work__title-row">
        <h2 id="ingest-work-title" class="section-header">{{ title }}</h2>
        <span class="ingest-work__count" :aria-label="`${attentionCount} source jobs need attention`">{{ attentionCount }}</span>
      </div>
      <p>{{ description }}</p>
    </header>

    <div v-if="items.length" class="ingest-work__table-wrap">
      <table class="ingest-work__table">
        <thead>
          <tr>
            <th scope="col">Source job</th>
            <th scope="col">Method</th>
            <th scope="col">Last update</th>
            <th scope="col" class="ingest-work__numeric">Records</th>
            <th scope="col">Validation</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" :class="`ingest-work__row--${item.statusTone}`">
            <td>
              <button type="button" class="ingest-work__item-btn" @click="$emit('open', item)">
                <span
                  class="ingest-work__source-icon"
                  :class="[
                    `ingest-work__source-icon--${item.statusTone}`,
                    { 'ingest-work__source-icon--vendor': item.vendor },
                  ]"
                >
                  <img v-if="item.vendor === 'xero'" :src="xeroLogo" class="ingest-work__vendor-logo" alt="" />
                  <component :is="iconFor(item.icon)" v-else aria-hidden="true" />
                </span>
                <span class="ingest-work__source-copy">
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.source }}</span>
                </span>
              </button>
            </td>
            <td><span class="ingest-work__method">{{ item.mode }}</span></td>
            <td><span class="ingest-work__freshness">{{ item.freshnessLabel }}</span></td>
            <td class="ingest-work__numeric">{{ item.recordsLabel }}</td>
            <td><span class="ingest-work__validation">{{ item.validationLabel }}</span></td>
            <td>
              <span class="ingest-work__status" :class="`ingest-work__status--${item.statusTone}`">
                <span class="ingest-work__status-dot" aria-hidden="true" />
                {{ item.status }}
              </span>
            </td>
            <td class="ingest-work__action-cell">
              <button type="button" class="ingest-work__open-btn" :aria-label="`View ${item.label}`" @click="$emit('open', item)">
                <ChevronRight aria-hidden="true" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import {
  Database, Landmark, LineChart, Mail, MessageSquareText, PenLine, ReceiptText, Upload, ChevronRight,
} from 'lucide-vue-next';
import xeroLogo from '../../assets/vendors/xero-logo';

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  items: { type: Array, required: true },
});
defineEmits(['open']);

const attentionCount = computed(() => props.items.filter((item) => item.statusTone === 'warning').length);

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

function iconFor(key) { return ICONS[key] || ReceiptText; }
</script>
