<template>
  <div class="fullscreen flex flex-center" style="background: var(--kdl-page-bg);">
    <q-card class="login-card" flat bordered>
      <q-card-section class="q-pb-xs">
        <div class="text-subtitle1 text-weight-bold text-center" style="color: var(--kdl-text-primary);">
          Klikk Financials
        </div>
        <div class="text-caption text-center q-mt-xs" style="color: var(--kdl-text-muted);">
          Sign in to continue
        </div>
      </q-card-section>

      <q-card-section class="q-pt-sm">
        <q-form @submit="handleLogin" class="q-gutter-sm">
          <q-input
            v-model="username"
            label="Username"
            outlined
            dense
            :rules="[val => !!val || 'Username is required']"
          />

          <q-input
            v-model="password"
            label="Password"
            type="password"
            outlined
            dense
            :rules="[val => !!val || 'Password is required']"
          />

          <div v-if="error" class="text-negative text-caption">
            {{ error }}
          </div>

          <div class="q-pt-xs">
            <q-btn
              label="Sign in"
              type="submit"
              color="primary"
              class="full-width"
              dense
              :loading="loading"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleLogin() {
  error.value = '';
  loading.value = true;

  try {
    const result = await authStore.login(username.value, password.value);
    
    if (result.success) {
      const redirect = route.query.redirect || '/app';
      router.push(redirect);
    } else {
      error.value = result.error || 'Login failed';
    }
  } catch (err) {
    error.value = err.message || 'An error occurred during login';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--kdl-card-bg);
  border-color: var(--kdl-border);
  border-radius: 8px;
  box-shadow: var(--shadow-lifted);
}
</style>
