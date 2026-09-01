<template>
  <KPopover v-model="menuOpen" side="bottom" align="end">
    <template #trigger>
      <button
        type="button"
        class="kdl-tenant-btn"
        :class="{
          'kdl-tenant-btn--missing': !selectedTenantId,
          'kdl-tenant-btn--open': menuOpen,
        }"
        :aria-label="selectedTenantId ? `Entity: ${label}` : 'Select entity'"
        :aria-invalid="selectedTenantId ? undefined : 'true'"
        @keydown.capture="handleTriggerKeydown"
      >
        <Building2 v-if="selectedTenantId" class="kdl-tenant-btn__state-icon" aria-hidden="true" />
        <CircleAlert v-else class="kdl-tenant-btn__state-icon" aria-hidden="true" />
        <span class="kdl-tenant-btn__copy">
          <strong>{{ label }}</strong>
          <span>{{ selectedTenantId ? 'Entity' : 'Required' }}</span>
        </span>
        <ChevronDown class="kdl-tenant-btn__chevron" aria-hidden="true" />
      </button>
    </template>

    <section class="kdl-tenant-menu" aria-label="Select entity">
      <header class="kdl-tenant-menu__header">
        <h2>Entity</h2>
        <p>Select the company context for this workspace.</p>
      </header>
      <div v-if="tenantOptions.length === 0" class="kdl-tenant-menu__empty">
        No entities available
      </div>
      <button
        v-for="option in tenantOptions"
        :key="option.value"
        type="button"
        class="kdl-tenant-menu__item"
        :class="{ 'kdl-tenant-menu__item--active': option.value === selectedTenantId }"
        :aria-pressed="option.value === selectedTenantId"
        @click="select(option.value)"
      >
        <Building2 aria-hidden="true" />
        <span class="kdl-tenant-menu__item-copy">
          <span>{{ option.label }}</span>
          <small v-if="option.isDemo">Demo data</small>
        </span>
        <Check v-if="option.value === selectedTenantId" aria-hidden="true" />
      </button>
    </section>
  </KPopover>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Building2, Check, ChevronDown, CircleAlert } from 'lucide-vue-next';
import { entityId, entityName, useDataStore } from '../stores/data';
import KPopover from './klikk/KPopover.vue';

const props = defineProps({
  fallbackLabel: {
    type: String,
    default: 'Select entity',
  },
});

const dataStore = useDataStore();
const menuOpen = ref(false);

const selectedTenantId = computed(() => dataStore.selectedTenant);
const tenantOptions = computed(() => dataStore.tenants.map((tenant) => ({
  label: entityName(tenant),
  value: entityId(tenant),
  isDemo: tenant.isDemo === true,
})));
const label = computed(() => {
  const match = tenantOptions.value.find((option) => option.value === selectedTenantId.value);
  return match?.label || props.fallbackLabel;
});

function select(value) {
  dataStore.setSelectedTenant(value);
  menuOpen.value = false;
}

function handleTriggerKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  menuOpen.value = true;
}
</script>
