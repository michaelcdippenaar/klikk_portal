<template>
  <q-page class="q-pa-lg">
    <div class="text-h4 q-mb-sm">Klikk Financials Console</div>
    <div class="text-subtitle1 text-grey-7 q-mb-lg">Group financial operations, Xero, Investec, and Planning Analytics</div>

    <div class="row q-gutter-lg">
      <q-card
        class="app-card cursor-pointer col-12 col-sm-5 col-md-3"
        bordered
        @click="openDjango()"
      >
        <q-card-section class="text-center">
          <q-icon name="dashboard" size="48px" color="primary" />
          <div class="text-h6 q-mt-md">Console</div>
          <div class="text-caption text-grey-7 q-mt-sm">Xero, Investec, and reporting workflows</div>
        </q-card-section>
      </q-card>

      <q-card class="app-card cursor-pointer col-12 col-sm-5 col-md-3" bordered @click="openPaw()">
        <q-card-section class="text-center">
          <q-icon name="analytics" size="48px" color="primary" />
          <div class="text-h6 q-mt-md">Planning Analytics</div>
          <div class="text-caption text-grey-7 q-mt-sm">TM1 and PAW on the RedHat VM</div>
        </q-card-section>
      </q-card>

      <q-card class="app-card cursor-pointer col-12 col-sm-5 col-md-3" bordered @click="openAgent()">
        <q-card-section class="text-center">
          <q-icon name="smart_toy" size="48px" color="primary" />
          <div class="text-h6 q-mt-md">AI Agent</div>
          <div class="text-caption text-grey-7 q-mt-sm">Financial assistant and model tools</div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

function openDjango() {
  router.push({ name: 'processes' });
}

function openPaw() {
  window.open('http://192.168.1.132/paw/', '_blank');
}

function openAgent() {
  router.push({ name: 'ai-agent' });
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
