import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Quasar used bare 'src/', 'pages/', 'layouts/', 'boot/', 'components/' aliases
      src: fileURLToPath(new URL('./src', import.meta.url)),
      pages: fileURLToPath(new URL('./src/pages', import.meta.url)),
      layouts: fileURLToPath(new URL('./src/layouts', import.meta.url)),
      boot: fileURLToPath(new URL('./src/boot', import.meta.url)),
      components: fileURLToPath(new URL('./src/components', import.meta.url)),
      stores: fileURLToPath(new URL('./src/stores', import.meta.url)),
      assets: fileURLToPath(new URL('./src/assets', import.meta.url)),
      // Redirect any remaining `from 'quasar'` imports to the stub shim so
      // the five pages not yet migrated (Credentials, XeroConnect, AiAgent,
      // AgentMonitor, AiAgentSetup) don't break the build.
      quasar: fileURLToPath(new URL('./src/components/_QuasarStubs.js', import.meta.url)),
    },
  },

  server: {
    port: 9000,
    open: true,
  },

  build: {
    outDir: 'dist',
    target: ['es2019', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
  },

  css: {
    preprocessorOptions: {
      sass: {
        // Silence legacy sass division warnings
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
});
