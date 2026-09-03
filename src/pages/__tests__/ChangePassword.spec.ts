// @vitest-environment happy-dom
/**
 * ChangePassword.spec.ts — mount spec for src/pages/ChangePassword.vue.
 *
 * The screen an account holding a temporary password is held on. The REAL
 * page and its REAL klikk primitives (SectionCard / KInput / KAlert /
 * KLockup) are mounted; only the auth store and vue-router are stubbed.
 *
 * What is verified:
 *   - a confirm mismatch is caught CLIENT-side: no API call at all
 *   - missing fields are caught client-side, field by field
 *   - a valid submit calls the store with (current, new) in that order
 *   - server validator messages render, one per rule, and no navigation
 *     happens on failure
 *   - success navigates to ?redirect when present, else the role-appropriate
 *     landing page
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

const mockAuth = vi.hoisted(() => ({
  isAuditor: false,
  mustChangePassword: true,
  user: { role: 'standard' },
  changePassword: vi.fn(),
}));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mockAuth }));

const routerPush = vi.fn();
const routeQuery: Record<string, unknown> = {};
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  useRoute: () => ({ query: routeQuery }),
}));

import ChangePassword from '../ChangePassword.vue';

let warnings: string[];

function mountPage() {
  return mount(ChangePassword, {
    attachTo: document.body,
    global: { config: { warnHandler: (msg: string) => { warnings.push(msg); } } },
  });
}

/** KInput renders a real <input>; fill by label text. */
function fill(w: ReturnType<typeof mount>, label: string, value: string) {
  const field = w.findAll('label').find((l) => l.text().includes(label));
  expect(field, `no field labelled ${label}`).toBeTruthy();
  const id = field!.attributes('for');
  const input = id
    ? w.find<HTMLInputElement>(`#${id}`)
    : field!.find<HTMLInputElement>('input');
  expect(input.exists(), `no input for ${label}`).toBe(true);
  return input.setValue(value);
}

async function submit(w: ReturnType<typeof mount>) {
  await w.get('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  warnings = [];
  routerPush.mockReset();
  for (const k of Object.keys(routeQuery)) delete routeQuery[k];
  mockAuth.isAuditor = false;
  mockAuth.mustChangePassword = true;
  mockAuth.user = { role: 'standard' };
  mockAuth.changePassword.mockReset().mockResolvedValue({ success: true });
  document.body.innerHTML = '';
});

describe('ChangePassword — client-side validation', () => {
  it('a confirm mismatch blocks the submit without hitting the API', async () => {
    const w = mountPage();
    await fill(w, 'Current password', 'temp-one');
    await fill(w, 'New password', 'Kb7!zqrt-Landau');
    await fill(w, 'Confirm new password', 'Kb7!zqrt-Landa');
    await submit(w);

    expect(mockAuth.changePassword).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
    expect(w.text()).toContain('do not match');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('missing fields are reported without an API call', async () => {
    const w = mountPage();
    await submit(w);
    expect(mockAuth.changePassword).not.toHaveBeenCalled();
    expect(w.text()).toContain('Current password is required');

    await fill(w, 'Current password', 'temp-one');
    await submit(w);
    expect(mockAuth.changePassword).not.toHaveBeenCalled();
    expect(w.text()).toContain('New password is required');
    w.unmount();
  });
});

describe('ChangePassword — server round trip', () => {
  it('calls the store with (current, new) and navigates to the redirect on success', async () => {
    routeQuery.redirect = '/app/pipeline/audit/receipts?to_process=true';
    const w = mountPage();
    await fill(w, 'Current password', 'temp-one');
    await fill(w, 'New password', 'Kb7!zqrt-Landau');
    await fill(w, 'Confirm new password', 'Kb7!zqrt-Landau');
    await submit(w);

    expect(mockAuth.changePassword).toHaveBeenCalledWith('temp-one', 'Kb7!zqrt-Landau');
    expect(routerPush).toHaveBeenCalledWith('/app/pipeline/audit/receipts?to_process=true');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('with no redirect, a standard user lands on /app and an auditor on the receipts register', async () => {
    const w = mountPage();
    await fill(w, 'Current password', 'temp-one');
    await fill(w, 'New password', 'Kb7!zqrt-Landau');
    await fill(w, 'Confirm new password', 'Kb7!zqrt-Landau');
    await submit(w);
    expect(routerPush).toHaveBeenCalledWith('/app');
    w.unmount();

    routerPush.mockReset();
    mockAuth.isAuditor = true;
    mockAuth.user = { role: 'auditor' };
    const a = mountPage();
    await fill(a, 'Current password', 'temp-one');
    await fill(a, 'New password', 'Kb7!zqrt-Landau');
    await fill(a, 'Confirm new password', 'Kb7!zqrt-Landau');
    await submit(a);
    expect(routerPush).toHaveBeenCalledWith({ name: 'audit-receipts' });
    a.unmount();
  });

  it('renders every server validator message and does NOT navigate', async () => {
    mockAuth.changePassword.mockResolvedValue({
      success: false,
      error: 'The new password was rejected',
      errors: [
        'This password is too short. It must contain at least 8 characters.',
        'This password is too common.',
      ],
    });
    const w = mountPage();
    await fill(w, 'Current password', 'temp-one');
    await fill(w, 'New password', 'abc');
    await fill(w, 'Confirm new password', 'abc');
    await submit(w);

    const list = w.get('[data-test="password-errors"]');
    expect(list.findAll('li').map((li) => li.text())).toEqual([
      'This password is too short. It must contain at least 8 characters.',
      'This password is too common.',
    ]);
    expect(w.text()).toContain('The new password was rejected');
    expect(routerPush).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('a wrong current password shows the server message with no validator list', async () => {
    mockAuth.changePassword.mockResolvedValue({
      success: false,
      error: 'Current password is incorrect',
      errors: [],
    });
    const w = mountPage();
    await fill(w, 'Current password', 'wrong');
    await fill(w, 'New password', 'Kb7!zqrt-Landau');
    await fill(w, 'Confirm new password', 'Kb7!zqrt-Landau');
    await submit(w);

    expect(w.text()).toContain('Current password is incorrect');
    expect(w.find('[data-test="password-errors"]').exists()).toBe(false);
    expect(routerPush).not.toHaveBeenCalled();
    w.unmount();
  });

  it('a retry after a failure clears the previous validator messages', async () => {
    mockAuth.changePassword.mockResolvedValueOnce({
      success: false, error: 'rejected', errors: ['This password is too common.'],
    });
    const w = mountPage();
    await fill(w, 'Current password', 'temp-one');
    await fill(w, 'New password', 'abc');
    await fill(w, 'Confirm new password', 'abc');
    await submit(w);
    expect(w.find('[data-test="password-errors"]').exists()).toBe(true);

    mockAuth.changePassword.mockResolvedValue({ success: true });
    await fill(w, 'New password', 'Kb7!zqrt-Landau');
    await fill(w, 'Confirm new password', 'Kb7!zqrt-Landau');
    await submit(w);
    await nextTick();

    expect(w.find('[data-test="password-errors"]').exists()).toBe(false);
    expect(routerPush).toHaveBeenCalledWith('/app');
    w.unmount();
  });
});
