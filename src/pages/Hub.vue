<template>
  <q-layout view="hHh lpR fFf" class="bg-grey-2">
    <q-page-container>
      <q-page class="flex flex-center">
        <div class="column items-center q-gutter-md" style="max-width: 760px;">
          <div class="text-h4 text-weight-bold text-primary q-mb-xs">
            Klikk Financials Console
          </div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Group financial operations, Xero, Investec, and Planning Analytics
          </div>

          <div class="row q-gutter-sm justify-center">
            <q-card
              class="hub-card cursor-pointer col-12 col-md-4"
              bordered
              @click="goToFrontendAdmin()"
            >
              <q-card-section class="text-center q-pa-md">
                <q-icon name="admin_panel_settings" size="32px" color="primary" />
                <div class="text-subtitle2 q-mt-sm">Console</div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  Xero, Investec, and reporting workflows
                </div>
              </q-card-section>
            </q-card>

            <q-card
              class="hub-card cursor-pointer col-12 col-md-4"
              bordered
              @click="openPAW()"
            >
              <q-card-section class="text-center q-pa-md">
                <q-icon name="analytics" size="32px" color="primary" />
                <div class="text-subtitle2 q-mt-sm">PAW</div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  TM1 and PAW on the RedHat VM
                </div>
              </q-card-section>
            </q-card>

            <q-card
              class="hub-card cursor-pointer col-12 col-md-4"
              bordered
              @click="goToFrontendAdmin()"
            >
              <q-card-section class="text-center q-pa-md">
                <q-icon name="dashboard" size="32px" color="primary" />
                <div class="text-subtitle2 q-mt-sm">AI Agent</div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  Financial assistant and model tools
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

function openPAW() {
  window.open('http://192.168.1.132/paw/', '_blank');
}
function goToFrontendAdmin() {
  router.push({ name: 'processes' });
}
</script>

<style scoped lang="sass">
.hub-card
  transition: transform 0.2s, box-shadow 0.2s
  &:hover
    transform: translateY(-4px)
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12)
</style>
