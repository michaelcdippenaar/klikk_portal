import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import routes from './routes';

const router = createRouter({
  history: createWebHistory('/'),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes,
});

// Routes an auditor account may open. Everything else redirects to the
// receipts register. UI-shaping only — the backend middleware is the real
// gate (auditors get 403 outside read-only /audit/).
const AUDITOR_ROUTES = new Set(['login', 'change-password', 'audit-receipts', 'audit-findings']);

// Navigation guard for protected routes
router.beforeEach((to, from, next) => {
  try {
    const authStore = useAuthStore();

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      next({ name: 'login', query: { redirect: to.fullPath } });
      return;
    }

    if (to.path === '/login' && authStore.isAuthenticated) {
      if (authStore.mustChangePassword) {
        next({ name: 'change-password' });
        return;
      }
      next(authStore.isAuditor ? { name: 'audit-receipts' } : { path: '/app' });
      return;
    }

    // BEFORE the auditor restriction: an auditor holding a temporary password
    // must reach change-password, not be bounced to the receipts register they
    // are not yet allowed to read.
    if (
      authStore.isAuthenticated
      && authStore.mustChangePassword
      && to.name !== 'change-password'
    ) {
      next({ name: 'change-password', query: { redirect: to.fullPath } });
      return;
    }

    if (authStore.isAuditor && to.name && !AUDITOR_ROUTES.has(to.name)) {
      next({ name: 'audit-receipts' });
      return;
    }

    next();
  } catch (error) {
    console.error('Router guard error:', error);
    next();
  }
});

export default router;
