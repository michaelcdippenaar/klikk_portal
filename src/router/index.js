import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import routes from './routes';

const router = createRouter({
  history: createWebHistory('/'),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes,
});

// Navigation guard for protected routes
router.beforeEach((to, from, next) => {
  try {
    const authStore = useAuthStore();

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      next({ name: 'login', query: { redirect: to.fullPath } });
      return;
    }

    if (to.path === '/login' && authStore.isAuthenticated) {
      next({ path: '/app' });
      return;
    }

    next();
  } catch (error) {
    console.error('Router guard error:', error);
    next();
  }
});

export default router;
