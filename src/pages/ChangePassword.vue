<template>
  <!-- AppPage intentionally omitted: like Login, this sits OUTSIDE the app
       shell — the account cannot use the console until the password is set,
       so showing the nav would offer routes that all answer 403. -->
  <div class="login-page">
    <div class="login-card-wrapper">
      <div class="login-lockup" aria-label="klikk financials">
        <KLockup size="lg" class="login-lockup__svg" />
      </div>

      <SectionCard :description="cardDescription">
        <form class="login-form" @submit.prevent="handleSubmit">
          <KInput
            v-model="currentPassword"
            label="Current password"
            type="password"
            autocomplete="current-password"
            :error="!!currentError"
            :error-message="currentError"
          />

          <KInput
            v-model="newPassword"
            label="New password"
            type="password"
            autocomplete="new-password"
            :error="!!newError"
            :error-message="newError"
          />

          <KInput
            v-model="confirmPassword"
            label="Confirm new password"
            type="password"
            autocomplete="new-password"
            :error="!!confirmError"
            :error-message="confirmError"
          />

          <KAlert v-if="error" variant="error" :body="error" />

          <!-- Server-side validator messages (Django's password validators).
               Listed rather than joined: they are separate, actionable rules. -->
          <ul v-if="serverErrors.length" class="cp-errors" role="alert" data-test="password-errors">
            <li v-for="(message, i) in serverErrors" :key="i">{{ message }}</li>
          </ul>

          <button
            type="submit"
            class="btn-primary login-submit"
            :disabled="loading"
            data-test="change-password-submit"
          >
            {{ loading ? 'Saving…' : 'Set new password' }}
          </button>
        </form>
      </SectionCard>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import SectionCard from '../components/klikk/SectionCard.vue';
import KInput from '../components/klikk/KInput.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KLockup from '../components/klikk/KLockup.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');
const serverErrors = ref([]);
const currentError = ref('');
const newError = ref('');
const confirmError = ref('');

const cardDescription = computed(() =>
  authStore.mustChangePassword
    ? 'Your account was created with a temporary password. Set your own to continue.'
    : 'Set a new password',
);

function resetErrors() {
  error.value = '';
  serverErrors.value = [];
  currentError.value = '';
  newError.value = '';
  confirmError.value = '';
}

async function handleSubmit() {
  resetErrors();

  if (!currentPassword.value) {
    currentError.value = 'Current password is required';
    return;
  }
  if (!newPassword.value) {
    newError.value = 'New password is required';
    return;
  }
  // Checked here as well as server-side: a mismatch is the user's typo, and a
  // round trip to be told so is a worse experience than an immediate answer.
  if (newPassword.value !== confirmPassword.value) {
    confirmError.value = 'The two passwords do not match';
    return;
  }

  loading.value = true;
  try {
    const result = await authStore.changePassword(currentPassword.value, newPassword.value);
    if (!result.success) {
      error.value = result.error || 'Could not change the password';
      serverErrors.value = result.errors || [];
      return;
    }
    const fallback = authStore.isAuditor ? { name: 'audit-receipts' } : '/app';
    router.push(route.query.redirect || fallback);
  } catch (err) {
    error.value = err.message || 'Could not change the password';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* Deliberately the same card as Login.vue so this does not read as a
   different product mid-sign-in. Login's styles are `scoped`, so the layout
   rules are repeated here rather than reached into — the alternative
   (un-scoping Login) would make these class names global for no benefit. */
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 32px 0;
  overflow: auto;
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
  position: relative;
}

.login-lockup {
  color: var(--kdl-text-primary);
  display: flex;
  justify-content: center;
}

.login-lockup__svg {
  height: 36px;
  width: auto;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-submit {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.cp-errors {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--kdl-danger, var(--kdl-text-primary));
}
</style>
