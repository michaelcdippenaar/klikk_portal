import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import apiClient from './api/client.js';
import { initTheme } from './composables/useTheme.js';

// CSS — klikk.css owns Tailwind base/components/utilities layers
import './css/klikk.css';
// portals.css: global z-index for Reka-portalled nodes (must follow klikk.css for token access)
import './css/portals.css';
// cost-behaviour.css: categorical chart hues (KDL has no categorical palette — gap noted in file)
import './css/cost-behaviour.css';
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

app.mount('#app');
