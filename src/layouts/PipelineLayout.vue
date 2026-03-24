<template>
  <div class="row no-wrap" style="height: 100%;">
    <q-drawer
      v-model="drawerOpen"
      show-if-above
      bordered
      class="bg-grey-1"
      :width="240"
      :breakpoint="700"
    >
      <q-list>
        <q-item-label header class="text-grey-8">Xero</q-item-label>

        <q-item clickable v-ripple :to="{ name: 'processes' }">
          <q-item-section avatar><q-icon name="play_circle" /></q-item-section>
          <q-item-section>Processes</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'data' }">
          <q-item-section avatar><q-icon name="table_chart" /></q-item-section>
          <q-item-section>Data Viewer</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'compare' }">
          <q-item-section avatar><q-icon name="compare_arrows" /></q-item-section>
          <q-item-section>Comparison</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'xero-connect' }">
          <q-item-section avatar><q-icon name="link" /></q-item-section>
          <q-item-section>Connect to Xero</q-item-section>
        </q-item>

        <q-separator spaced />

        <q-item-label header class="text-grey-8">Investec</q-item-label>

        <q-item clickable v-ripple :to="{ name: 'investec-holdings' }">
          <q-item-section avatar><q-icon name="pie_chart" /></q-item-section>
          <q-item-section>Share holdings</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'investec-transactions' }">
          <q-item-section avatar><q-icon name="list_alt" /></q-item-section>
          <q-item-section>Share transactions</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'investec-share-codes' }">
          <q-item-section avatar><q-icon name="code" /></q-item-section>
          <q-item-section>Share codes</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'investec-account' }">
          <q-item-section avatar><q-icon name="account_balance" /></q-item-section>
          <q-item-section>Account</q-item-section>
        </q-item>

        <q-separator spaced />

        <q-item-label header class="text-grey-8">Financial Investments</q-item-label>

        <q-item clickable v-ripple :to="{ name: 'financial-investments' }">
          <q-item-section avatar><q-icon name="show_chart" /></q-item-section>
          <q-item-section>Stocks</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'dividend-forecast' }">
          <q-item-section avatar><q-icon name="paid" /></q-item-section>
          <q-item-section>Dividend Forecast</q-item-section>
        </q-item>

        <q-separator spaced />

        <q-item-label header class="text-grey-8">Planning Analytics</q-item-label>

        <q-item clickable v-ripple :to="{ name: 'planning-analytics' }">
          <q-item-section avatar><q-icon name="insights" /></q-item-section>
          <q-item-section>Pipeline</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <div class="col">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const drawerOpen = ref(true);
</script>
