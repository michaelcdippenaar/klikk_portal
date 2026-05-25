<!--
  TODO(kdl-phase-3.5): DataTable is not currently wired to any page.
  If you wire it back, ensure the columns prop follows the same shape
  as q-table columns and that callers pass amount values as raw numbers.
  formatCurrency from helpers.js is DEPRECATED for display formatting —
  use useFormatCurrency() instead (ADR: docs/decisions/negative-numbers.md).
-->
<template>
  <q-table
    :rows="rows"
    :columns="columns"
    :loading="loading"
    :pagination="pagination"
    row-key="id"
    @request="onRequest"
  >
    <template v-slot:body-cell-amount="props">
      <q-td :props="props" class="kdl-numeric">
        {{ format(props.value, { mode: 'accounting' }) }}
      </q-td>
    </template>
  </q-table>
</template>

<script setup>
// TODO(kdl-phase-3.5): DataTable is currently unused — no page imports it.
// Kept alive so it can be wired back without rework. Formatting is ADR-locked
// via useFormatCurrency; helpers.formatCurrency is no longer used here.
import { useFormatCurrency } from '../composables/useFormatCurrency';

const { format } = useFormatCurrency();

defineProps({
  rows: {
    type: Array,
    required: true,
  },
  columns: {
    type: Array,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  pagination: {
    type: Object,
    default: () => ({
      page: 1,
      rowsPerPage: 25,
      rowsNumber: 0,
    }),
  },
});

const emit = defineEmits(['request']);

function onRequest(props) {
  emit('request', props);
}
</script>
