<template>
  <div class="fullscreen flex flex-center login-page">
    <div class="login-card-wrapper">
      <SectionCard title="Klikk Financials" description="Sign in to continue">
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
      </SectionCard>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import SectionCard from '../components/klikk/SectionCard.vue';

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
.login-page {
  background: var(--kdl-page-bg);
}

.login-card-wrapper {
  width: 100%;
  max-width: 380px;
  padding: 0 16px;
}
</style>
