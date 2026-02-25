<template>
  <q-layout view="hHh lpR fFf" class="bg-grey-2">
    <q-page-container>
      <q-page class="flex flex-center">
        <div class="column items-center q-gutter-xl" style="max-width: 900px;">
          <div class="text-h3 text-weight-bold text-primary q-mb-md">
            Klikk Portal
          </div>
          <div class="text-subtitle1 text-grey-7 q-mb-lg">
            Choose an application to continue
          </div>

          <div class="row q-gutter-lg justify-center">
            <q-card
              class="hub-card cursor-pointer col-12 col-md-4"
              bordered
              @click="goTo('/django-admin/')"
            >
              <q-card-section class="text-center">
                <q-icon name="admin_panel_settings" size="48px" color="primary" />
                <div class="text-h6 q-mt-md">Klikk Admin Console</div>
                <div class="text-caption text-grey-7 q-mt-sm">
                  Backend admin console
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
                  Planning Analytics for Excel
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
                <div class="text-h6 q-mt-md">Frontend Admin</div>
                <div class="text-caption text-grey-7 q-mt-sm">
                  Xero & Investec admin console
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

function goTo(url) {
  window.location.href = url;
}
function openPAW() {
  window.open('https://paw.klikk.co.za', '_blank');
}
function goToFrontendAdmin() {
  router.push({ name: 'dashboard' });
}
</script>

<style scoped lang="sass">
.hub-card
  transition: transform 0.2s, box-shadow 0.2s
  &:hover
    transform: translateY(-4px)
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12)
</style>
