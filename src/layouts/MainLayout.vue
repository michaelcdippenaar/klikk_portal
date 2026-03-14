<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-toolbar-title class="text-weight-bold">
          Klikk Admin Console
        </q-toolbar-title>

        <q-space />

        <TenantSelector />

        <q-btn
          flat
          round
          dense
          icon="logout"
          @click="handleLogout"
        >
          <q-tooltip>Logout</q-tooltip>
        </q-btn>
      </q-toolbar>

      <q-toolbar class="bg-primary q-pt-none" style="min-height: 40px;">
        <q-btn flat no-caps label="Portal" icon="home" :to="{ name: 'portal' }" class="nav-btn" />
        <q-btn flat no-caps label="Pipeline" icon="sync" :to="{ name: 'pipeline' }" class="nav-btn" />
        <q-btn flat no-caps label="Setup" icon="settings" :to="{ name: 'setup' }" class="nav-btn" />
        <q-btn flat no-caps label="Reporting" icon="assessment" class="nav-btn" disabled />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useDataStore } from '../stores/data';
import TenantSelector from '../components/TenantSelector.vue';

const router = useRouter();
const authStore = useAuthStore();
const dataStore = useDataStore();

onMounted(() => {
  dataStore.loadTenants().catch(err => {
    console.warn('Failed to load tenants:', err);
  });
});

function handleLogout() {
  authStore.logout();
  router.push({ name: 'login' });
}
</script>

<style scoped>
.nav-btn {
  font-size: 13px;
  padding: 4px 12px;
}
</style>
