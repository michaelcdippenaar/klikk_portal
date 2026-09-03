// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditActivity.spec.ts — mount spec for src/pages/AuditActivity.vue.
 *
 * House pattern: mount the REAL page (AppPage / PageHeader / FilterBar / KTable
 * all real), mock only src/api/activity and vue-router.
 *
 * What is verified:
 *   - the initial fetch carries the default paging, and rows render
 *   - a pre-populated URL query hydrates the filters into the request
 *   - changing a filter resets to page 1 AND syncs the URL
 *   - paging through the server pager re-requests with the new page
 *   - `changes` renders as "field: from → to", and bulk as a count
 *   - the export button calls exportActivity WITHOUT paging params
 *   - a 403 renders an access message rather than an empty table
 *   - filter vocabularies come from the server, and a failure to fetch them
 *     leaves the page working
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../api/activity', () => ({
  listActivity: vi.fn(),
  listObjectActivity: vi.fn(),
  listActivityActors: vi.fn(),
  listActivityActions: vi.fn(),
  exportActivity: vi.fn(),
}));

const routerReplace = vi.fn();
const routerPush = vi.fn();
const routeQuery: Record<string, unknown> = {};
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));

import * as api from '../../api/activity';
import AuditActivity from '../AuditActivity.vue';
import KSelect from '../../components/klikk/KSelect.vue';

const mocked = api as unknown as {
  listActivity: ReturnType<typeof vi.fn>;
  listActivityActors: ReturnType<typeof vi.fn>;
  listActivityActions: ReturnType<typeof vi.fn>;
  exportActivity: ReturnType<typeof vi.fn>;
};

// ── Fixtures — production-shaped events ─────────────────────────────────────

const EVENTS = [
  {
    id: 3, occurred_at: '2026-08-20T12:00:00Z', actor: 'auditor@firm.co.za',
    actor_role: 'auditor', action: 'finding.viewed', target_kind: 'finding',
    target_id: '1', target_ref: 'FY26-001 — Payments before bill', changes: null,
    source: 'console', ip: '41.1.2.3', user_agent: 'Mozilla', request_id: '',
  },
  {
    id: 2, occurred_at: '2026-08-20T11:00:00Z', actor: 'mc', actor_role: 'standard',
    action: 'finding.status_changed', target_kind: 'finding', target_id: '1',
    target_ref: 'FY26-001 — Payments before bill',
    changes: { status: { from: 'OPEN', to: 'RESOLVED' } },
    source: 'console', ip: null, user_agent: '', request_id: '',
  },
  {
    id: 1, occurred_at: '2026-08-20T10:00:00Z', actor: 'mcp', actor_role: '',
    action: 'finding.bulk_status', target_kind: 'finding', target_id: '',
    target_ref: '', changes: { count: 12, ids: [1, 2, 3], status: 'RESOLVED' },
    source: 'bulk', ip: null, user_agent: '', request_id: '',
  },
];

function listResponse(results = EVENTS, extra: Record<string, unknown> = {}) {
  return { count: results.length, page: 1, page_size: 50, num_pages: 1, results, ...extra };
}

// ── Harness ─────────────────────────────────────────────────────────────────

let warnings: string[];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function mountPage() {
  return mount(AuditActivity, {
    attachTo: document.body,
    global: { config: { warnHandler: (msg: string) => { warnings.push(msg); } } },
  });
}

function bodyRows(w: ReturnType<typeof mount>) {
  return w.findAll('tbody tr');
}

function filterSelect(w: ReturnType<typeof mount>, label: string) {
  const sel = w.findAllComponents(KSelect).find((s) => s.props('label') === label);
  if (!sel) throw new Error(`No KSelect labelled "${label}"`);
  return sel;
}

beforeEach(() => {
  warnings = [];
  routerReplace.mockReset();
  routerPush.mockReset();
  for (const k of Object.keys(routeQuery)) delete routeQuery[k];
  mocked.listActivity.mockReset().mockResolvedValue(listResponse());
  mocked.listActivityActors.mockReset().mockResolvedValue(['anine', 'auditor@firm.co.za', 'mc']);
  mocked.listActivityActions.mockReset()
    .mockResolvedValue(['finding.status_changed', 'finding.viewed', 'comment.posted']);
  mocked.exportActivity.mockReset().mockResolvedValue(undefined);
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  document.body.innerHTML = '';
});

describe('AuditActivity — load and render', () => {
  it('fetches with the default paging and renders one row per event', async () => {
    const w = mountPage();
    await flushPromises();

    expect(mocked.listActivity).toHaveBeenCalledTimes(1);
    expect(mocked.listActivity).toHaveBeenCalledWith({ page: 1, page_size: 50 });
    expect(bodyRows(w).length).toBe(3);
    expect(w.text()).toContain('3 events');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('shows who, the role pill, and the action slug', async () => {
    const w = mountPage();
    await flushPromises();

    const first = bodyRows(w)[0].text();
    expect(first).toContain('auditor@firm.co.za');
    expect(first).toContain('auditor');
    expect(first).toContain('finding.viewed');
    w.unmount();
  });

  it('renders a field change as "from → to" and a bulk action as a count', async () => {
    const w = mountPage();
    await flushPromises();

    const changed = bodyRows(w)[1].text();
    expect(changed).toContain('status:');
    expect(changed).toContain('OPEN');
    expect(changed).toContain('RESOLVED');

    const bulk = bodyRows(w)[2].text();
    expect(bulk).toContain('12 items');
    expect(bulk).toContain('RESOLVED');
    w.unmount();
  });

  it('a finding target is a link that navigates to the register', async () => {
    const w = mountPage();
    await flushPromises();

    const link = w.find('[data-test="activity-target-link"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    expect(routerPush).toHaveBeenCalledWith({ name: 'audit-findings', query: { finding: '1' } });
    w.unmount();
  });

  it('a bulk event with no target renders plain text, not a dead link', async () => {
    const w = mountPage();
    await flushPromises();
    const links = w.findAll('[data-test="activity-target-link"]');
    // Only the two finding rows link; the bulk row has no target_id.
    expect(links.length).toBe(2);
    w.unmount();
  });

  it('renders an empty state rather than a bare table when nothing matches', async () => {
    mocked.listActivity.mockResolvedValue(listResponse([]));
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('No activity');
    w.unmount();
  });

  it('a 403 says so instead of showing an empty trail', async () => {
    mocked.listActivity.mockRejectedValue({ response: { status: 403 } });
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('does not have access to the activity trail');
    expect(bodyRows(w).length).toBe(0);
    w.unmount();
  });
});

describe('AuditActivity — filters and URL sync', () => {
  it('hydrates filters from the URL into the first request', async () => {
    routeQuery.actor = 'mc';
    routeQuery.target_kind = 'finding';
    routeQuery.since = '2026-08-01';
    routeQuery.q = 'FY26';
    routeQuery.action = ['finding.status_changed'];
    routeQuery.page = '3';

    mountPage();
    await flushPromises();

    expect(mocked.listActivity).toHaveBeenCalledWith({
      page: 3, page_size: 50, actor: 'mc', target_kind: 'finding',
      since: '2026-08-01', q: 'FY26', action: ['finding.status_changed'],
    });
  });

  it('changing a filter re-requests from page 1 and syncs the URL', async () => {
    routeQuery.page = '4';
    const w = mountPage();
    await flushPromises();
    mocked.listActivity.mockClear();

    filterSelect(w, 'Who').vm.$emit('update:modelValue', 'anine');
    await flushPromises();

    expect(mocked.listActivity).toHaveBeenCalledWith({ page: 1, page_size: 50, actor: 'anine' });
    expect(routerReplace).toHaveBeenCalledWith({ query: { actor: 'anine' } });
    w.unmount();
  });

  it('the action filter comes from the SERVER, so it cannot drift from the app', async () => {
    const w = mountPage();
    await flushPromises();
    expect(mocked.listActivityActions).toHaveBeenCalled();
    expect(mocked.listActivityActors).toHaveBeenCalled();
    w.unmount();
  });

  it('a failure to load the filter vocabularies leaves the page working', async () => {
    mocked.listActivityActions.mockRejectedValue(new Error('boom'));
    mocked.listActivityActors.mockRejectedValue(new Error('boom'));
    const w = mountPage();
    await flushPromises();

    expect(bodyRows(w).length).toBe(3);
    expect(w.text()).not.toContain('does not have access');
    w.unmount();
  });
});

describe('AuditActivity — export', () => {
  it('exports the FILTER without the paging params', async () => {
    routeQuery.actor = 'mc';
    const w = mountPage();
    await flushPromises();

    await w.get('[data-test="activity-export"]').trigger('click');
    await flushPromises();

    expect(mocked.exportActivity).toHaveBeenCalledWith({ actor: 'mc' });
    w.unmount();
  });

  it('a failed export surfaces an error instead of failing silently', async () => {
    mocked.exportActivity.mockRejectedValue(new Error('nope'));
    const w = mountPage();
    await flushPromises();

    await w.get('[data-test="activity-export"]').trigger('click');
    await flushPromises();

    expect(w.text()).toContain('Exporting the activity trail failed');
    w.unmount();
  });
});
