<template>
  <q-layout view="hHh lpR fFf" class="bg-grey-2">
    <q-page-container>
      <q-page class="flex flex-center">
        <div class="column items-center q-gutter-xl" style="max-width: 900px;">
          <div class="text-h3 text-weight-bold text-primary q-mb-md">
            Klikk Financials Console
          </div>
          <div class="text-subtitle1 text-grey-7 q-mb-lg">
            Group financial operations, Xero, Investec, and Planning Analytics
          </div>

          <div class="row q-gutter-lg justify-center">
            <q-card
              class="hub-card cursor-pointer col-12 col-md-4"
              bordered
              @click="goToFrontendAdmin()"
            >
              <q-card-section class="text-center">
                <q-icon name="admin_panel_settings" size="48px" color="primary" />
                <div class="text-h6 q-mt-md">Console</div>
                <div class="text-caption text-grey-7 q-mt-sm">
                  Xero, Investec, and reporting workflows
                </div>
              </q-card-section>
            </q-card>

            <q-card
              class="hub-card cursor-pointer col-12 col-md-4"
              bordered
              @click="openPAW()"
            >
              <q-card-section class="text-center">
                <q-icon name="analytics" size="48px" color="primary" />
                <div class="text-h6 q-mt-md">PAW</div>
                <div class="text-caption text-grey-7 q-mt-sm">
                  TM1 and PAW on the RedHat VM
                </div>
              </q-card-section>
            </q-card>

            <q-card
              class="hub-card cursor-pointer col-12 col-md-4"
              bordered
              @click="goToFrontendAdmin()"
            >
              <q-card-section class="text-center">
                <q-icon name="dashboard" size="48px" color="primary" />
                <div class="text-h6 q-mt-md">AI Agent</div>
                <div class="text-caption text-grey-7 q-mt-sm">
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
