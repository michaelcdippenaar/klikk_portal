<template>
  <section class="overview-table-panel" :aria-labelledby="headingId">
    <header class="overview-table-panel__header">
      <div>
        <h2 :id="headingId" class="section-header">{{ table.title }}</h2>
        <p>{{ table.description }}</p>
      </div>
      <span class="overview-table-panel__count">{{ table.rows.length }} items</span>
    </header>

    <div class="overview-table-panel__scroll">
      <table class="overview-table" :class="{ 'overview-table--no-actions': table.actions === false }">
        <thead>
          <tr>
            <th v-for="column in table.columns" :key="column.key" scope="col" :class="{ 'overview-table__numeric': column.align === 'right' }">
              {{ column.label }}
            </th>
            <th v-if="table.actions !== false" scope="col"><span class="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in table.rows" :key="row.id">
            <td v-for="column in table.columns" :key="column.key" :class="{ 'overview-table__numeric': column.align === 'right' }">
              <template v-if="isCellObject(row[column.key])">
                <span v-if="row[column.key].status" class="overview-table__status" :class="`overview-tone--${row[column.key].tone || 'neutral'}`">
                  <span class="overview-table__status-dot" aria-hidden="true" />
                  {{ row[column.key].primary }}
                </span>
                <span v-else class="overview-table__stack">
                  <strong :class="`overview-tone--${row[column.key].tone || 'neutral'}`">{{ row[column.key].primary }}</strong>
                  <small v-if="row[column.key].secondary">{{ row[column.key].secondary }}</small>
                </span>
              </template>
              <span v-else>{{ row[column.key] }}</span>
            </td>
            <td v-if="table.actions !== false" class="overview-table__action-cell">
              <button type="button" class="overview-table__action" :aria-label="`Open ${rowLabel(row)}`" @click="$emit('open', row)">
                <ChevronRight class="overview-table__action-icon" aria-hidden="true" />
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
import { ChevronRight } from 'lucide-vue-next';

const props = defineProps({ table: { type: Object, required: true } });
defineEmits(['open']);

const headingId = computed(() => `overview-table-${String(props.table.title || 'items').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
function isCellObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function rowLabel(row) {
  const firstKey = props.table.columns[0]?.key;
  const value = row[firstKey];
  return isCellObject(value) ? value.primary : value || 'item';
}
</script>
