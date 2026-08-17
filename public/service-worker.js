/*
 * Self-destroying service worker.
 *
 * The console migrated off Quasar (which shipped a Workbox PWA service worker)
 * to plain Vite. A stale Workbox registration left over on already-visited
 * browsers was intercepting asset fetches and re-issuing the current build's
 * single-path chunk requests at a DOUBLED path (/assets/assets/<chunk>.js),
 * 404-ing lazy-loaded route chunks (e.g. Reporting) even though the server
 * serves them correctly at /assets/<chunk>.js.
 *
 * This kill-switch replaces that stale SW: on next update-check the browser
 * fetches this (byte-different) script, which unregisters itself, purges the
 * old precache, and reloads open tabs so they run against the network directly.
 * The current app registers no service worker, so this file is otherwise inert.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* ignore - cache API may be unavailable */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          try {
            client.navigate(client.url);
          } catch (e) {
            /* ignore - client may not be navigable */
          }
        }
      } catch (e) {
        /* ignore */
      }
    })()
  );
});
