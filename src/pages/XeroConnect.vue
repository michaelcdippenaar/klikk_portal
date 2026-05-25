<template>
  <div class="page-content">
    <PageHeader title="Xero Connection" subtitle="Configure API credentials and connect to your Xero organisation" />

    <!-- Callback result banners -->
    <div v-if="callbackStatus === 'success'" class="klikk-alert-strip tone-success xc-banner" role="alert">
      <!-- Lucide check-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <span><strong>Connected successfully!</strong> {{ callbackTenants ? `Tenants: ${callbackTenants}` : '' }}</span>
      <button class="btn btn-ghost btn-sm" @click="clearCallback">Dismiss</button>
    </div>

    <div v-if="callbackStatus === 'error'" class="klikk-alert-strip tone-error xc-banner" role="alert">
      <!-- Lucide alert-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span><strong>Connection failed:</strong> {{ callbackMessage }}</span>
      <button class="btn btn-ghost btn-sm" @click="clearCallback">Dismiss</button>
    </div>

    <!-- Step 1: API Credentials Setup -->
    <div class="xc-card">
      <div class="xc-card__header">
        <span class="xc-step-badge" :class="connectionStatus?.has_credentials ? 'xc-step-badge--done' : ''">1</span>
        <h2 class="xc-card__title">API Credentials</h2>
        <StatusPill v-if="connectionStatus?.has_credentials" tone="success" label="Configured" size="sm" />
      </div>
      <p class="xc-card__desc">
        Enter your Xero app's Client ID and Client Secret.
        Get these from the
        <a href="https://developer.xero.com/app/manage" target="_blank" rel="noopener" class="xc-link">Xero Developer Portal</a>.
      </p>

      <form class="xc-form" @submit.prevent="saveCredentials">
        <KInput
          v-model="clientId"
          label="Client ID"
          :help-text="connectionStatus?.credentials_client_id ? `Current: ${connectionStatus.credentials_client_id}` : ''"
        />
        <KInput
          v-model="clientSecret"
          label="Client Secret"
          type="password"
        />
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="savingCredentials || !clientId || !clientSecret"
        >
          {{ savingCredentials ? 'Saving…' : 'Save' }}
        </button>
      </form>
    </div>

    <!-- Step 2: Connect to Xero -->
    <div class="xc-card">
      <div class="xc-card__header">
        <span class="xc-step-badge" :class="connectionStatus?.connected ? 'xc-step-badge--done' : ''">2</span>
        <h2 class="xc-card__title">Connect to Xero</h2>
        <StatusPill v-if="connectionStatus?.connected" tone="success" label="Connected" size="sm" />
      </div>
      <p class="xc-card__desc">Authorize access to your Xero organisation. This will redirect you to Xero to log in.</p>

      <div class="xc-connect-row">
        <button
          class="btn btn-primary"
          :disabled="connecting || !connectionStatus?.has_credentials"
          @click="connectToXero"
        >
          <!-- Lucide link -->
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          {{ connecting ? 'Connecting…' : (connectionStatus?.connected ? 'Reconnect to Xero' : 'Connect to Xero') }}
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="loadingStatus" @click="loadConnectionStatus" title="Refresh status">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        <span v-if="!connectionStatus?.has_credentials" class="xc-hint">Save your API credentials first</span>
      </div>
    </div>

    <!-- Connected Tenants -->
    <div v-if="connectionStatus?.tenants?.length > 0" class="xc-card">
      <h2 class="xc-card__title" style="margin-bottom: 12px;">Connected Tenants</h2>
      <div class="xc-tenant-list">
        <div v-for="tenant in connectionStatus.tenants" :key="tenant.tenant_id" class="xc-tenant-row">
          <div class="xc-tenant-row__icon">
            <!-- Lucide check-circle (active) or alert-triangle (expired) -->
            <svg v-if="!tenant.token_expired" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="xc-icon--success" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="xc-icon--warning" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="xc-tenant-row__body">
            <div class="xc-tenant-row__name">{{ tenant.tenant_name }}</div>
            <div class="xc-tenant-row__id">ID: {{ tenant.tenant_id.substring(0, 8) }}…</div>
          </div>
          <StatusPill
            :tone="tenant.token_expired ? 'warning' : 'success'"
            :label="tenant.token_expired ? 'Token expired' : 'Active'"
            size="sm"
          />
          <span v-if="tenant.connected_at" class="xc-tenant-row__date">{{ formatDate(tenant.connected_at) }}</span>
        </div>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loadingStatus && !connectionStatus" class="xc-card xc-card--skeleton">
      <div class="xc-skeleton-line xc-skeleton-line--short"></div>
      <div class="xc-skeleton-line xc-skeleton-line--long"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from '../composables/useToast';
import { useDataStore } from '../stores/data';
import { getXeroAuthUrl, getXeroConnectionStatus, saveXeroCredentials } from '../api/endpoints';
import PageHeader from '../components/klikk/PageHeader.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import KInput from '../components/klikk/KInput.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const dataStore = useDataStore();

const connectionStatus = ref(null);
const loadingStatus = ref(false);
const connecting = ref(false);
const savingCredentials = ref(false);

// Credentials form
const clientId = ref('');
const clientSecret = ref('');

// Callback params from URL query
const callbackStatus = ref(route.query.status || null);
const callbackTenants = ref(route.query.tenants || null);
const callbackMessage = ref(route.query.message || null);

function clearCallback() {
  callbackStatus.value = null;
  callbackTenants.value = null;
  callbackMessage.value = null;
  router.replace({ query: {} });
}

async function loadConnectionStatus() {
  loadingStatus.value = true;
  try {
    connectionStatus.value = await getXeroConnectionStatus();
  } catch (err) {
    console.error('Failed to load connection status:', err);
  } finally {
    loadingStatus.value = false;
  }
}

async function saveCredentials() {
  if (!clientId.value || !clientSecret.value) return;

  savingCredentials.value = true;
  try {
    const result = await saveXeroCredentials(clientId.value, clientSecret.value);
    toast.success(result.message || 'Credentials saved');
    clientId.value = '';
    clientSecret.value = '';
    await loadConnectionStatus();
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to save credentials');
  } finally {
    savingCredentials.value = false;
  }
}

async function connectToXero() {
  connecting.value = true;
  try {
    const data = await getXeroAuthUrl();
    if (data.auth_url) {
      window.location.href = data.auth_url;
    }
  } catch (err) {
    console.error('Failed to initiate Xero auth:', err);
    toast.error(err.response?.data?.error || 'Failed to start Xero connection');
  } finally {
    connecting.value = false;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

onMounted(async () => {
  await loadConnectionStatus();
  if (callbackStatus.value === 'success') {
    await dataStore.loadTenants();
  }
});
</script>

<style scoped>
.page-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.xc-banner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.xc-card {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 18px 20px;
}

.xc-card--skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.xc-card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.xc-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin: 0;
}

.xc-card__desc {
  font-size: 13px;
  color: var(--kdl-text-muted);
  margin-bottom: 14px;
}

.xc-step-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-muted);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;
}

.xc-step-badge--done {
  background: var(--kdl-status-success);
  color: #fff;
}

.xc-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}

.xc-form > :first-child,
.xc-form > :nth-child(2) {
  flex: 1 1 200px;
}

.xc-connect-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.xc-hint {
  font-size: 12px;
  color: var(--kdl-text-hint);
}

.xc-link {
  color: var(--kdl-accent);
  text-decoration: none;
}
.xc-link:hover {
  text-decoration: underline;
}

.xc-tenant-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.xc-tenant-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.xc-tenant-row:last-child {
  border-bottom: none;
}

.xc-tenant-row__icon {
  flex-shrink: 0;
}

.xc-icon--success { color: var(--kdl-status-success); }
.xc-icon--warning { color: var(--kdl-status-warning); }

.xc-tenant-row__body {
  flex: 1 1 0;
  min-width: 0;
}

.xc-tenant-row__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--kdl-text-primary);
}

.xc-tenant-row__id {
  font-size: 12px;
  color: var(--kdl-text-hint);
}

.xc-tenant-row__date {
  font-size: 12px;
  color: var(--kdl-text-hint);
  flex-shrink: 0;
}

/* Skeleton */
.xc-skeleton-line {
  height: 14px;
  border-radius: 4px;
  background: var(--kdl-hover-bg);
  animation: xc-pulse 1.5s ease-in-out infinite;
}
.xc-skeleton-line--short { width: 200px; }
.xc-skeleton-line--long  { width: 300px; }

@keyframes xc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
