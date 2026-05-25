<template>
  <div class="kdl-tenant-trigger" ref="triggerRef">
    <button
      class="kdl-tenant-btn"
      :aria-expanded="menuOpen"
      aria-haspopup="listbox"
      @click="menuOpen = !menuOpen"
    >
      <span class="kdl-tenant-btn__label">{{ label }}</span>
      <!-- Lucide chevron-down -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="kdl-tenant-btn__chevron"
        :class="{ 'kdl-tenant-btn__chevron--open': menuOpen }"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <Transition name="kdl-tenant-menu-fade">
      <div
        v-if="menuOpen"
        class="kdl-tenant-menu"
        role="listbox"
        :aria-label="label"
      >
        <div
          v-if="tenantOptions.length === 0"
          class="kdl-tenant-menu__empty"
        >
          No tenants available
        </div>
        <button
          v-for="option in tenantOptions"
          :key="option.value"
          class="kdl-tenant-menu__item"
          :class="{ 'kdl-tenant-menu__item--active': option.value === selectedTenantId }"
          role="option"
          :aria-selected="option.value === selectedTenantId"
          @click="select(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useDataStore } from '../stores/data';

const dataStore = useDataStore();
const menuOpen = ref(false);
const triggerRef = ref(null);

const selectedTenantId = computed({
  get: () => dataStore.selectedTenant,
  set: (value) => dataStore.setSelectedTenant(value),
});

const tenantOptions = computed(() =>
  dataStore.tenants.map(tenant => ({
    label: tenant.tenant_name,
    value: tenant.tenant_id,
  }))
);

const label = computed(() => {
  if (!selectedTenantId.value) return 'Select tenant';
  const match = tenantOptions.value.find(o => o.value === selectedTenantId.value);
  return match ? match.label : 'Select tenant';
});

function select(value) {
  dataStore.setSelectedTenant(value);
  menuOpen.value = false;
}

function handleClickOutside(e) {
  if (triggerRef.value && !triggerRef.value.contains(e.target)) {
    menuOpen.value = false;
  }
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside, true);
  if (dataStore.tenants.length === 0) {
    await dataStore.loadTenants();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside, true);
});
</script>

<style scoped>
/* ── Trigger wrapper ──────────────────────────────────── */
.kdl-tenant-trigger {
  position: relative;
  display: inline-flex;
}

/* ── Button ───────────────────────────────────────────── */
.kdl-tenant-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: var(--kdl-text-primary);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
}

.kdl-tenant-btn:hover {
  background: var(--kdl-hover-bg);
}

/* ── Label ────────────────────────────────────────────── */
.kdl-tenant-btn__label {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* No tenant selected — muted style */
.kdl-tenant-btn:has(.kdl-tenant-btn__label:empty) .kdl-tenant-btn__label,
.kdl-tenant-btn[data-empty] .kdl-tenant-btn__label {
  color: var(--kdl-text-muted);
}

/* ── Chevron ──────────────────────────────────────────── */
.kdl-tenant-btn__chevron {
  flex-shrink: 0;
  color: var(--kdl-text-muted);
  transition: transform var(--duration-short) var(--ease-standard);
}

.kdl-tenant-btn__chevron--open {
  transform: rotate(180deg);
}

/* ── Dropdown menu ────────────────────────────────────── */
.kdl-tenant-menu-fade-enter-active,
.kdl-tenant-menu-fade-leave-active { transition: opacity 120ms, transform 120ms; }
.kdl-tenant-menu-fade-enter-from,
.kdl-tenant-menu-fade-leave-to { opacity: 0; transform: translateY(-4px); }

.kdl-tenant-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  min-width: 200px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-floating);
  overflow: hidden;
  padding: 4px;
}

.kdl-tenant-menu__empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--kdl-text-muted);
}

.kdl-tenant-menu__item {
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: transparent;
  border-radius: 5px;
  font-size: 14px;
  font-family: inherit;
  font-weight: 400;
  color: var(--kdl-text-secondary);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
}

.kdl-tenant-menu__item:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.kdl-tenant-menu__item--active {
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
  color: var(--kdl-accent);
  font-weight: 500;
}

.kdl-tenant-menu__item--active:hover {
  background: color-mix(in srgb, var(--kdl-accent) 15%, transparent);
}
</style>
