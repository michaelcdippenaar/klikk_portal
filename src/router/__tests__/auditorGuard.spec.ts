// @vitest-environment happy-dom
/**
 * auditorGuard.spec.ts — the router-level auditor gate.
 *
 * Auditor accounts (auth store isAuditor) may only open the audit pages;
 * every other named route redirects to the receipts register. This is
 * UI-shaping — the backend AuditorGateMiddleware is the security boundary —
 * but the redirect is what keeps the console coherent for an auditor, so it
 * gets its own gate here.
 *
 * The real router (routes + guard) is imported; only the auth store is
 * stubbed. Lazy page chunks resolve in happy-dom; no component is mounted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.hoisted(() => ({
  isAuthenticated: true,
  isAuditor: false,
  user: { role: 'standard' },
}));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mockAuth }));

import router from '../index';

describe('router — auditor guard', () => {
  beforeEach(() => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAuditor = false;
    mockAuth.user = { role: 'standard' };
  });

  // 60s: the first navigation loads real lazy page chunks, which is slow
  // on a loaded machine — the assertions themselves are instant.
  it('standard users navigate anywhere', async () => {
    await router.push({ name: 'portal' });
    expect(router.currentRoute.value.name).toBe('portal');
    await router.push({ name: 'audit-findings' });
    expect(router.currentRoute.value.name).toBe('audit-findings');
  }, 60_000);

  it('auditors reach the audit pages, query intact', async () => {
    mockAuth.isAuditor = true;
    await router.push({ path: '/app/pipeline/audit/receipts', query: { status: 'NOT IN XERO', page_size: '200' } });
    expect(router.currentRoute.value.name).toBe('audit-receipts');
    expect(router.currentRoute.value.query.status).toBe('NOT IN XERO');
    await router.push({ name: 'audit-findings', query: { fy: '2026' } });
    expect(router.currentRoute.value.name).toBe('audit-findings');
  });

  it('auditors are redirected off every other page to the receipts register', async () => {
    mockAuth.isAuditor = true;
    for (const target of ['portal', 'reporting', 'processes', 'investec-account', 'pricelist']) {
      await router.push({ name: 'audit-findings' });
      await router.push({ name: target }).catch(() => {});
      expect(router.currentRoute.value.name, `route ${target}`).toBe('audit-receipts');
    }
  });

  it('an authenticated auditor hitting /login lands on receipts, not the dashboard', async () => {
    mockAuth.isAuditor = true;
    await router.push('/login').catch(() => {});
    expect(router.currentRoute.value.name).toBe('audit-receipts');
  });

  it('unauthenticated users still land on login regardless of role', async () => {
    mockAuth.isAuthenticated = false;
    // Push a route we are NOT already on — a duplicate navigation is a no-op
    // and would never run the guard.
    await router.push({ name: 'audit-findings' }).catch(() => {});
    expect(router.currentRoute.value.name).toBe('login');
  });
});
