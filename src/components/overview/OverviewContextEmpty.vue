<template>
  <section class="overview-context-empty" role="status" aria-live="polite">
    <span class="overview-context-empty__icon" aria-hidden="true">
      <Building2 v-if="missingEntity" />
      <CalendarRange v-else />
    </span>
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { Building2, CalendarRange } from 'lucide-vue-next';

const props = defineProps({
  missingEntity: { type: Boolean, default: false },
  missingFinancialYear: { type: Boolean, default: false },
});

const title = computed(() => {
  if (props.missingEntity && props.missingFinancialYear) return 'Select an entity and financial year';
  if (props.missingEntity) return 'Select an entity to continue';
  return 'Select a financial year to continue';
});
const description = computed(() => (props.missingEntity
  ? 'Choose the company from the header to load its close workflow.'
  : 'Choose a financial year above to load its close periods and work.'));
</script>
