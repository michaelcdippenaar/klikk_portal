<template>
  <q-page class="q-pa-lg">
    <div class="text-h4 q-mb-sm">Klikk Portal</div>
    <div class="text-subtitle1 text-grey-7 q-mb-lg">Choose an application to continue</div>

    <div class="row q-gutter-lg">
      <q-card
        class="app-card cursor-pointer col-12 col-sm-5 col-md-3"
        bordered
        @click="openDjango()"
      >
        <q-card-section class="text-center">
          <q-icon name="admin_panel_settings" size="48px" color="primary" />
          <div class="text-h6 q-mt-md">klikk_financials_4</div>
          <div class="text-caption text-grey-7 q-mt-sm">Django Front End</div>
        </q-card-section>
      </q-card>

      <q-card
        class="app-card cursor-pointer col-12 col-sm-5 col-md-3"
        bordered
        @click="openPaw()"
      >
        <q-card-section class="text-center">
          <q-icon name="analytics" size="48px" color="primary" />
          <div class="text-h6 q-mt-md">PAW</div>
          <div class="text-caption text-grey-7 q-mt-sm">Planning Analytics for Excel</div>
        </q-card-section>
      </q-card>

      <q-card
        class="app-card cursor-pointer col-12 col-sm-5 col-md-3"
        bordered
        @click="openExternal('http://192.168.1.235:8000')"
      >
        <q-card-section class="text-center">
          <q-icon name="smart_toy" size="48px" color="primary" />
          <div class="text-h6 q-mt-md">klikk_ai_portal</div>
          <div class="text-caption text-grey-7 q-mt-sm">AI Agent</div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { getApiBaseUrl } from '../utils/constants';

function openDjango() {
  window.open(`${getApiBaseUrl()}/admin/`, '_blank');
}

function openPaw() {
  window.open('http://192.168.1.194:8080', '_blank');
}

function openExternal(url) {
  window.open(url, '_blank');
}
</script>

<style scoped>
.app-card {
  transition: transform 0.2s, box-shadow 0.2s;
}
.app-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}
</style>
