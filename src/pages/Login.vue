<template>
  <div class="fullscreen flex flex-center login-page">
    <div class="login-card-wrapper">

      <!-- Tally lockup — centred above the form card. Login is the highest-stakes
           brand moment; the lockup must appear here per finance-admin spec. -->
      <div class="login-lockup" aria-label="klikk financials">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 240 36"
          class="login-lockup__svg"
          aria-hidden="true"
          focusable="false"
        >
          <!-- Tally mark proportional to 36px tall lockup -->
          <rect x="0" y="5" width="18" height="5.5" rx="2" fill="currentColor" />
          <rect x="0" y="13" width="13" height="5.5" rx="2" fill="currentColor" />
          <rect x="0" y="21" width="8" height="5.5" rx="2" fill="currentColor" />
          <!-- "klikk" — ~28px / 600 for the larger login variant -->
          <text
            x="26"
            y="30"
            font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
            font-size="28"
            font-weight="600"
            letter-spacing="-0.7"
            fill="currentColor"
          >klikk</text>
          <!-- "financials" — ~18px / 500 / 60% opacity -->
          <text
            x="132"
            y="30"
            font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
            font-size="18"
            font-weight="500"
            letter-spacing="0.5"
            fill="currentColor"
            opacity="0.6"
          >financials</text>
        </svg>
      </div>

      <SectionCard description="Sign in to continue">
        <form @submit.prevent="handleLogin" class="login-form">
          <KInput
            v-model="username"
            label="Username"
            type="text"
            autocomplete="username"
            :error="!!usernameError"
            :error-message="usernameError"
          />

          <KInput
            v-model="password"
            label="Password"
            type="password"
            autocomplete="current-password"
            :error="!!passwordError"
            :error-message="passwordError"
          />

          <KAlert
            v-if="error"
            variant="error"
            :body="error"
          />

          <button type="submit" class="btn-primary login-submit" :disabled="loading">
            <svg
              v-if="loading"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="animate-spin" aria-hidden="true"
            >
              <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
            </svg>
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </SectionCard>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import SectionCard from '../components/klikk/SectionCard.vue';
import KInput from '../components/klikk/KInput.vue';
import KAlert from '../components/klikk/KAlert.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const usernameError = ref('');
const passwordError = ref('');

async function handleLogin() {
  // Clear previous errors
  error.value = '';
  usernameError.value = '';
  passwordError.value = '';

  // Basic client-side validation
  if (!username.value) {
    usernameError.value = 'Username is required';
    return;
  }
  if (!password.value) {
    passwordError.value = 'Password is required';
    return;
  }

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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

/* Tally lockup above the form */
.login-lockup {
  color: var(--kdl-text-primary);
  display: flex;
  justify-content: center;
}

.login-lockup__svg {
  height: 36px;
  width: auto;
  display: block;
}

/* Form stack */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Full-width submit button */
.login-submit {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>
