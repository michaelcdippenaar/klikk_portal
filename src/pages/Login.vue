<template>
  <!-- AppPage intentionally omitted: Login is a full-screen centred page outside the app shell. -->
  <div class="login-page">
    <div class="login-card-wrapper">

      <!-- Environment pill — hidden on production. Derives env from hostname
           because no VITE_ENV variable is defined in this project.
           Logic: localhost / 127.0.0.1 / 192.168.x → Development
                  staging.* → Staging
                  anything else → Production (pill hidden) -->
      <div v-if="envLabel !== 'Production'" class="login-env-pill" :class="`login-env-pill--${envLabel.toLowerCase()}`" :aria-label="`Environment: ${envLabel}`">
        {{ envLabel }}
      </div>

      <!-- Brand lockup — single source of truth via KLockup component -->
      <div class="login-lockup" aria-label="klikk financials">
        <KLockup size="lg" class="login-lockup__svg" />
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

          <!-- Password field + caps-lock indicator -->
          <div class="login-password-group">
            <KInput
              v-model="password"
              label="Password"
              type="password"
              autocomplete="current-password"
              :error="!!passwordError"
              :error-message="passwordError"
              @keydown="handlePasswordKey"
              @keyup="handlePasswordKey"
              @blur="capsLockOn = false"
            />

            <!-- Caps-lock indicator — info tone, not an error -->
            <div v-if="capsLockOn" class="login-capslock-hint" role="status" aria-live="polite">
              <!-- Lucide arrow-big-up at 14px / stroke-width 1.75 -->
              <svg
                xmlns="http://www.w3.org/2000/svg" width="14" height="14"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 18V12H5l7-7 7 7h-4v6H9z" />
                <path d="M9 21h6" />
              </svg>
              Caps Lock is on
            </div>

            <!-- Forgot password — no password-reset route exists in this project,
                 so we fall back to a mailto link with a pre-filled subject.
                 Decision: mailto avoids a 404 and routes the request to a human. -->
            <div class="login-forgot-row">
              <a
                href="mailto:?subject=Klikk%20Financials%20password%20reset"
                class="login-forgot-link"
              >Forgot your password?</a>
            </div>
          </div>

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

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const usernameError = ref('');
const passwordError = ref('');

// ── Caps-lock indicator ────────────────────────────────────────────────────
const capsLockOn = ref(false);

function handlePasswordKey(event) {
  capsLockOn.value = Boolean(event?.getModifierState?.('CapsLock'));
}

// ── Environment detection ──────────────────────────────────────────────────
// No VITE_ENV defined in this project — derive from hostname.
//   localhost / 127.x.x.x / 192.168.x.x → Development
//   staging.*                            → Staging
//   anything else                        → Production (pill hidden)
const envLabel = computed(() => {
  const hostname = window.location.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^192\.168\./.test(hostname)
  ) return 'Development';
  if (/^staging\./.test(hostname)) return 'Staging';
  return 'Production';
});

// ── Login handler ──────────────────────────────────────────────────────────
async function handleLogin() {
  error.value = '';
  usernameError.value = '';
  passwordError.value = '';

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

/* ── Environment pill ─────────────────────────────────────────────────────
   Sits above the lockup, centred. 11px overline-style — exempt from 12px floor
   per standing policy ("overline labels exempt").
   Production: hidden (v-if guard above).
   Development: accent tint (muted, not garish)
   Staging: warning tint
──────────────────────────────────────────────────────────────────────────── */
.login-env-pill {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 2px 10px;
  border-radius: 20px;
  line-height: 1.6;
  align-self: center;
}

.login-env-pill--development {
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
  color: var(--kdl-text-muted);
}

.login-env-pill--staging {
  background: color-mix(in srgb, #d97706 12%, transparent);
  color: #b45309;
}

/* Brand lockup above the form */
.login-lockup {
  color: var(--kdl-text-primary);
  display: flex;
  justify-content: center;
}

.login-lockup__svg {
  /* Height is controlled by KLockup's size="lg" scoped style (36px).
     Override just in case the parent context needs it explicit. */
  height: 36px;
  width: auto;
}

/* ── Form stack ───────────────────────────────────────────────────────────── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Password group: field + caps-lock hint + forgot link */
.login-password-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Caps-lock indicator ──────────────────────────────────────────────────
   Info tone: warning-600 colour (#d97706), small, not an error message.
──────────────────────────────────────────────────────────────────────────── */
.login-capslock-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  color: #d97706;
  line-height: 1.35;
}

/* ── Forgot password link ─────────────────────────────────────────────────
   Right-aligned, muted at rest, accent on hover.
──────────────────────────────────────────────────────────────────────────── */
.login-forgot-row {
  display: flex;
  justify-content: flex-end;
}

.login-forgot-link {
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-muted);
  text-decoration: none;
  transition: color 120ms ease;
}

.login-forgot-link:hover {
  color: var(--kdl-accent);
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
