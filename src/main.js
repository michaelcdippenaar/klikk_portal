import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import apiClient from './api/client.js';
import { initTheme } from './composables/useTheme.js';

// CSS — klikk.css owns Tailwind base/components/utilities layers
import './css/klikk.css';
import './css/app.sass';

// Apply persisted theme to <html> before first paint
initTheme();

const app = createApp(App);

// Pinia
const pinia = createPinia();
app.use(pinia);

// Router
app.use(router);

// Global properties (previously set in boot/axios.js)
app.config.globalProperties.$api = apiClient;

// Quasar stub — keeps this.$q.notify() / useQuasar() call sites from crashing
// during Phase 1+2 migration. Remove once all q-* usages are ported.
app.config.globalProperties.$q = {
  notify: () => {},
  dark: { isActive: false, set: () => {} },
  dialog: () => ({ onOk: () => {}, onCancel: () => {}, onDismiss: () => {} }),
  loading: { show: () => {}, hide: () => {} },
};

// Register global Quasar component stubs so any page using <q-btn> etc. compiles.
// These are replaced component-by-component during Phase 2.
import { registerQuasarStubs } from './components/_QuasarStubs.js';
registerQuasarStubs(app);

app.mount('#app');
