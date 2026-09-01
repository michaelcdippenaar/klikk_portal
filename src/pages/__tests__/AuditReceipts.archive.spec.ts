// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditReceipts.archive.spec.ts
 *
 * Adversarial mount-based spec for the ARCHIVE feature (2026-08-20) on the
 * Audit → Receipts console page — the feature that REPLACED the decision
 * control in the UI. Same harness as AuditReceipts.bulk.spec.ts: mount the
 * REAL page, mock only src/api/receipts and vue-router.
 *
 * What is verified:
 *   - the decision control is GONE from every surface (filter bar, rows,
 *     bulk bar, detail modal) — asserted on rendered DOM text/labels
 *   - the default list request carries NO archived param ('hide' IS the
 *     server default); 'Archived only' → archived:'true', 'Incl. archived'
 *     → archived:'all'; both reset paging to page 1
 *   - the archived choice round-trips through the URL (router.replace) and
 *     back via hydrateFromQuery on a fresh mount; garbage degrades to 'hide'
 *   - per-row Archive/Restore PATCHes { archived: true|false } for that
 *     row's sha256 and reloads the list (server truth over ghost rows)
 *   - bulk Archive/Restore POST { set_archived: true|false } for the whole
 *     selection — including a "select all N" selection (batch-chunking of
 *     >500 ids is bulkUpdateReceipts' own contract, covered by
 *     src/api/__tests__/receipts.bulk.spec.ts)
 *   - the "Archived" pill renders only for rows whose review.archived is true
 *   - the toolbar count/total come from the server `totals`, not from the
 *     visible rows
 *   - inline commenting works while a bulk selection is active, without a
 *     list reload and without disturbing the selection
 *   - REGRESSION GUARD: saving the review from the modal never sends
 *     `decision` — a decision:'' from a screen that no longer displays the
 *     control would silently wipe stored data
 *
 * Every test keeps the house guarantee: zero Vue warnings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../api/receipts', () => ({
  BULK_MAX: 500,
  getReceipts: vi.fn(),
  getReceipt: vi.fn(),
  getReceiptIds: vi.fn(),
  patchReceiptReview: vi.fn(),
  postReceiptComment: vi.fn(),
  bulkUpdateReceipts: vi.fn(),
  downloadReceiptsExport: vi.fn(),
}));

const routerReplace = vi.fn();
const routeQuery: Record<string, unknown> = {};

// The page reads the auth store for auditor UI-gating; controllable stub
// (vi.hoisted so the hoisted vi.mock factory can see it).
const mockAuth = vi.hoisted(() => ({ isAuditor: false, user: { role: 'standard' } }));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mockAuth }));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ replace: routerReplace }),
}));

import * as api from '../../api/receipts';
import AuditReceipts from '../AuditReceipts.vue';
import KSelect from '../../components/klikk/KSelect.vue';
import { useToast } from '../../composables/useToast';

const mocked = api as unknown as {
  getReceipts: ReturnType<typeof vi.fn>;
  getReceipt: ReturnType<typeof vi.fn>;
  getReceiptIds: ReturnType<typeof vi.fn>;
  patchReceiptReview: ReturnType<typeof vi.fn>;
  postReceiptComment: ReturnType<typeof vi.fn>;
  bulkUpdateReceipts: ReturnType<typeof vi.fn>;
  downloadReceiptsExport: ReturnType<typeof vi.fn>;
};

// ── Fixtures — hostile production shapes (mirrors the bulk spec) ────────────

const DEFAULT_REVIEW = {
  to_process: false, decision: '', note: '', archived: false,
  archived_at: null, archived_by: '', updated_by: '', updated_at: null,
};

function row(sha256: string, overrides: Record<string, unknown> = {}) {
  return {
    sha256,
    filename: `IMG_${sha256.slice(0, 4)}.jpg`,
    mime: 'image/jpeg',
    mime_ext: 'jpg',
    is_pdf: false,
    byte_size: 123456,
    view_url: `/backend/audit/receipts/${sha256.slice(0, 4)}/view/`,
    slip_ts: '2026-08-04T10:00:00Z',
    fy: 'FY27',
    supplier: 'Makro',
    total: '100.00',
    category: 'Equipment',
    slip_date: '2026-08-04',
    payment_method: 'Card',
    source: 'whatsapp',
    synced_to_xero: false,
    xero_status: 'PENDING',
    status_group: 'PENDING',
    xero_detail: null,
    xero_org: 'Klikk',
    journal: null,
    review: { ...DEFAULT_REVIEW },
    comment_count: 0,
    ...overrides,
  };
}

const P1_SHAS = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];

function page1Rows() {
  return [
    row(P1_SHAS[0], { supplier: 'Makro', total: '21600.00' }),
    // Hostile: no review block AT ALL (production has such rows).
    row(P1_SHAS[1], { supplier: null, total: null, category: null, review: undefined, status_group: 'NOT IN XERO', xero_status: 'NOT IN XERO' }),
    // A stored decision + comments — data that must survive untouched.
    row(P1_SHAS[2], { supplier: 'Spar', total: 'R 1 234,56', review: { ...DEFAULT_REVIEW, decision: 'CAPTURE', note: 'existing note' }, comment_count: 2 }),
  ];
}

/** Rows where the middle one is ARCHIVED — served under archived='all'/'true'. */
function mixedArchivedRows() {
  const rows = page1Rows();
  rows[1] = row(P1_SHAS[1], {
    supplier: 'Checkers',
    review: { ...DEFAULT_REVIEW, archived: true, archived_at: '2026-08-19T12:00:00Z', archived_by: 'mc' },
  });
  return rows;
}

function listResponse(results: unknown[], { count = results.length, num_pages = 1, page = 1, page_size = 50, sum_total = '23023.50' } = {}) {
  return {
    count,
    page,
    page_size,
    num_pages,
    totals: { count, sum_total },
    results,
  };
}

// ── Harness ─────────────────────────────────────────────────────────────────

let warnings: string[];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function mountPage() {
  return mount(AuditReceipts, {
    attachTo: document.body,
    global: {
      config: {
        warnHandler: (msg: string) => { warnings.push(msg); },
      },
    },
  });
}

/** The detail modal specifically — NOT [role="dialog"], which the reka
 *  popover content of the inline comment cell also carries. */
function modalEl(): HTMLElement | null {
  return document.body.querySelector('.kd-content');
}

function bodyRows(w: ReturnType<typeof mount>) {
  return w.findAll('tbody tr');
}

function headerCheckbox(w: ReturnType<typeof mount>) {
  return w.get('thead input.ktable-checkbox');
}

function bulkBar(w: ReturnType<typeof mount>) {
  return w.find('.ar-bulk-bar');
}

function barButton(w: ReturnType<typeof mount>, label: string) {
  const btn = bulkBar(w).findAll('button').find((b) => b.text() === label);
  if (!btn) throw new Error(`No bulk-bar button "${label}"`);
  return btn;
}

function rowButton(rowWrapper: ReturnType<typeof bodyRows>[number], label: string) {
  const btn = rowWrapper.findAll('button').find((b) => b.text() === label);
  if (!btn) throw new Error(`No row button "${label}"`);
  return btn;
}

/** Sorted copy — selection Sets have no order contract. */
const sorted = (a: string[]) => [...a].sort();

/** Header-relative cell lookup (same rationale as the sibling specs). */
function cellFor(w: ReturnType<typeof mount>, rowWrapper: ReturnType<typeof bodyRows>[number], label: string) {
  const idx = w.findAll('thead th').findIndex((th) => th.text().trim() === label);
  if (idx === -1) throw new Error(`No <th> labelled "${label}"`);
  return rowWrapper.findAll('td')[idx];
}

/** The FilterBar KSelect for a given label — driven via its controlled emit
 *  (the sanctioned escape hatch for reka's teleporting SelectPortal). */
function filterSelect(w: ReturnType<typeof mount>, label: string) {
  const sel = w.findAllComponents(KSelect).find((s) => s.props('label') === label);
  if (!sel) throw new Error(`No KSelect labelled "${label}"`);
  return sel;
}

const toast = useToast();
let toastBaseline: number;

beforeEach(() => {
  warnings = [];
  toastBaseline = toast.toasts.value.length;
  routerReplace.mockReset();
  for (const k of Object.keys(routeQuery)) delete routeQuery[k];
  mocked.getReceipts.mockReset().mockResolvedValue(listResponse(page1Rows()));
  // The detail endpoint returns the SAME receipt the list row shows (incl. its
  // review block) — the fixture must honour that or drafts assert against a
  // review the page never saw in production.
  mocked.getReceipt.mockReset().mockImplementation(async (sha: string) => {
    const base = page1Rows().find((r) => r.sha256 === sha) || row(sha);
    return { ...base, items: [], comments: [] };
  });
  mocked.getReceiptIds.mockReset();
  mocked.patchReceiptReview.mockReset().mockImplementation(
    async (_sha: string, body: Record<string, unknown>) => ({ ...DEFAULT_REVIEW, ...body }),
  );
  mocked.postReceiptComment.mockReset();
  mocked.bulkUpdateReceipts.mockReset().mockResolvedValue({ updated: 0, commented: 0, unknown: [] });
  mocked.downloadReceiptsExport.mockReset();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  document.body.innerHTML = '';
});

function newToasts() {
  return toast.toasts.value.slice(toastBaseline);
}

// ── The decision control is GONE ────────────────────────────────────────────

describe('AuditReceipts archive — no decision control anywhere', () => {
  it('filter bar, table, bulk bar and modal render NO decision control or label', async () => {
    const w = mountPage();
    await flushPromises();

    // Filter bar: an Archived select exists; no Decision select/label.
    const selectLabels = w.findAll('.kselect-label').map((l) => l.text());
    expect(selectLabels).toContain('Archived');
    expect(selectLabels).not.toContain('Decision');
    const allLabels = w.findAll('label').map((l) => l.text());
    expect(allLabels.some((t) => /Decision/.test(t))).toBe(false);

    // Table: no Decision column, no per-row select.
    const headers = w.findAll('thead th').map((th) => th.text().trim());
    expect(headers).not.toContain('Decision');
    expect(bodyRows(w)[0].find('.kselect-root').exists()).toBe(false);

    // Bulk bar: Archive / Restore exist; nothing decision-shaped.
    await headerCheckbox(w).setValue(true);
    await nextTick();
    const barLabels = bulkBar(w).findAll('button').map((b) => b.text());
    expect(barLabels).toContain('Archive');
    expect(barLabels).toContain('Restore');
    expect(barLabels.some((t) => /Decision/i.test(t))).toBe(false);

    // Modal: no decision select, none of the enum labels, no "Decision" text.
    await bodyRows(w)[2].trigger('click'); // the row that HAS a stored decision
    await flushPromises();
    const dlg = modalEl();
    expect(dlg).not.toBeNull();
    expect(dlg!.querySelector('.kselect-root')).toBeNull();
    expect(dlg!.textContent).not.toMatch(/Decision/);
    for (const enumLabel of ['Capture', 'Meal (skip)', 'Personal', 'Duplicate', 'Already in Xero', 'Undecided']) {
      expect(dlg!.textContent, `modal must not render "${enumLabel}"`).not.toContain(enumLabel);
    }

    // Whole document (modal + any portals included): the capital-D word never renders.
    expect(document.body.textContent).not.toMatch(/Decision/);
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Archived filter → API params + page reset ───────────────────────────────

describe('AuditReceipts archive — the Archived filter', () => {
  it("the default list request carries NO archived param; 'true' / 'all' are sent literally and reset to page 1", async () => {
    routeQuery.page = '3';
    mocked.getReceipts.mockImplementation(async (params: Record<string, unknown>) =>
      listResponse(page1Rows(), { count: 130, num_pages: 5, page: Number(params?.page) || 1 }));

    const w = mountPage();
    await flushPromises();

    // Default: no archived key AT ALL — 'hide' is the server's own default.
    expect(mocked.getReceipts).toHaveBeenCalledTimes(1);
    expect(mocked.getReceipts.mock.calls[0][0]).toEqual({ page: 3, page_size: 50 });
    expect(mocked.getReceipts.mock.calls[0][0]).not.toHaveProperty('archived');

    // 'Archived only' → archived: 'true', back to page 1.
    filterSelect(w, 'Archived').vm.$emit('update:modelValue', 'true');
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ archived: 'true', page: 1, page_size: 50 });

    // Move off page 1 again, then 'Incl. archived' → archived: 'all', page 1.
    await w.get('[aria-label="Next page"]').trigger('click');
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ archived: 'true', page: 2, page_size: 50 });

    filterSelect(w, 'Archived').vm.$emit('update:modelValue', 'all');
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ archived: 'all', page: 1, page_size: 50 });

    // Back to 'hide' → the param disappears again.
    filterSelect(w, 'Archived').vm.$emit('update:modelValue', 'hide');
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 1, page_size: 50 });
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('the archived choice round-trips through the URL: router.replace out, hydrateFromQuery back in', async () => {
    // OUT: choosing a value lands in the query (and 'hide' never does).
    const w = mountPage();
    await flushPromises();
    expect(routerReplace).toHaveBeenLastCalledWith({ query: {} });

    filterSelect(w, 'Archived').vm.$emit('update:modelValue', 'true');
    await flushPromises();
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { archived: 'true' } });

    filterSelect(w, 'Archived').vm.$emit('update:modelValue', 'hide');
    await flushPromises();
    expect(routerReplace).toHaveBeenLastCalledWith({ query: {} });
    w.unmount();

    // BACK IN: a fresh mount with ?archived=all hydrates the filter, sends the
    // param, keeps it in the URL, and the select SHOWS the hydrated choice.
    routerReplace.mockReset();
    mocked.getReceipts.mockClear();
    routeQuery.archived = 'all';
    const w2 = mountPage();
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenCalledWith({ archived: 'all', page: 1, page_size: 50 });
    expect(routerReplace).toHaveBeenCalledWith({ query: { archived: 'all' } });
    expect(filterSelect(w2, 'Archived').text()).toContain('Incl. archived');
    w2.unmount();

    // Garbage in the URL degrades to the default (hide): no param, clean URL.
    routerReplace.mockReset();
    mocked.getReceipts.mockClear();
    routeQuery.archived = 'banana';
    const w3 = mountPage();
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenCalledWith({ page: 1, page_size: 50 });
    expect(routerReplace).toHaveBeenCalledWith({ query: {} });
    expect(warnings).toEqual([]);
    w3.unmount();
  });
});

// ── Per-row Archive / Restore ───────────────────────────────────────────────

describe('AuditReceipts archive — per-row Archive / Restore', () => {
  it("row Archive PATCHes exactly { archived: true } for that row's sha256, reloads the list, and does NOT open the modal", async () => {
    const w = mountPage();
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenCalledTimes(1);

    await rowButton(bodyRows(w)[0], 'Archive').trigger('click');
    await flushPromises();

    expect(mocked.patchReceiptReview).toHaveBeenCalledTimes(1);
    const [sha, body] = mocked.patchReceiptReview.mock.calls[0];
    expect(sha).toBe(P1_SHAS[0]);
    // EXACTLY archived — no decision, no note, no to_process piggybacking.
    expect(body).toEqual({ archived: true });

    // Server truth wins: the list is reloaded (the row may leave the
    // population under the default 'hide' filter).
    expect(mocked.getReceipts).toHaveBeenCalledTimes(2);
    expect(newToasts().some((t) => t.tone === 'success' && t.message === 'Receipt archived.')).toBe(true);

    // The @click.stop held: no modal, no detail fetch.
    expect(modalEl()).toBeNull();
    expect(mocked.getReceipt).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('an archived row shows Restore, which PATCHes { archived: false } and reloads', async () => {
    routeQuery.archived = 'all';
    mocked.getReceipts.mockResolvedValue(listResponse(mixedArchivedRows()));

    const w = mountPage();
    await flushPromises();

    // The archived row offers Restore; the live rows offer Archive.
    const archivedRow = bodyRows(w)[1];
    expect(archivedRow.findAll('button').map((b) => b.text())).toContain('Restore');
    expect(bodyRows(w)[0].findAll('button').map((b) => b.text())).toContain('Archive');

    await rowButton(archivedRow, 'Restore').trigger('click');
    await flushPromises();

    expect(mocked.patchReceiptReview).toHaveBeenCalledTimes(1);
    expect(mocked.patchReceiptReview).toHaveBeenCalledWith(P1_SHAS[1], { archived: false });
    expect(mocked.getReceipts).toHaveBeenCalledTimes(2);
    expect(newToasts().some((t) => t.tone === 'success' && t.message === 'Receipt restored.')).toBe(true);
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('when the archive PATCH rejects, no reload happens and the failure is surfaced', async () => {
    mocked.patchReceiptReview.mockRejectedValue(new Error('500'));
    const w = mountPage();
    await flushPromises();

    await rowButton(bodyRows(w)[0], 'Archive').trigger('click');
    await flushPromises();

    expect(mocked.getReceipts).toHaveBeenCalledTimes(1); // mount only — no reload
    expect(w.text()).toContain('Saving the review failed — change reverted.');
    expect(newToasts().some((t) => t.tone === 'success')).toBe(false);
    w.unmount();
  });
});

// ── The Archived pill ───────────────────────────────────────────────────────

describe('AuditReceipts archive — the Archived pill', () => {
  it('renders in the supplier cell ONLY for rows whose review.archived is true', async () => {
    routeQuery.archived = 'all';
    mocked.getReceipts.mockResolvedValue(listResponse(mixedArchivedRows()));

    const w = mountPage();
    await flushPromises();

    expect(cellFor(w, bodyRows(w)[1], 'Supplier').text()).toContain('Archived');
    expect(cellFor(w, bodyRows(w)[0], 'Supplier').text()).not.toContain('Archived');
    expect(cellFor(w, bodyRows(w)[2], 'Supplier').text()).not.toContain('Archived');
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Bulk Archive / Restore ──────────────────────────────────────────────────

describe('AuditReceipts archive — bulk Archive / Restore', () => {
  it('bulk Archive posts { set_archived: true } and bulk Restore { set_archived: false } for the whole selection', async () => {
    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    mocked.bulkUpdateReceipts.mockResolvedValue({ updated: 3, commented: 0, unknown: [] });

    await barButton(w, 'Archive').trigger('click');
    await flushPromises();
    let [ids, actions] = mocked.bulkUpdateReceipts.mock.calls.at(-1)!;
    expect(sorted(ids)).toEqual(sorted(P1_SHAS));
    expect(actions).toEqual({ set_archived: true });
    // Success path resyncs from the server.
    expect(mocked.getReceipts).toHaveBeenCalledTimes(2);

    await barButton(w, 'Restore').trigger('click');
    await flushPromises();
    [ids, actions] = mocked.bulkUpdateReceipts.mock.calls.at(-1)!;
    expect(sorted(ids)).toEqual(sorted(P1_SHAS));
    expect(actions).toEqual({ set_archived: false });
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('bulk Archive with an active "select all N" selection posts ALL matching sha256s in one bulkUpdateReceipts call', async () => {
    const ALL_30 = [...P1_SHAS, ...Array.from({ length: 27 }, (_, i) => `${String(i).padStart(2, '0')}${'9'.repeat(62)}`)];
    mocked.getReceipts.mockResolvedValue(listResponse(page1Rows(), { count: 30 }));
    mocked.getReceiptIds.mockResolvedValue({ count: 30, sha256s: ALL_30, truncated: false });

    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    await barButton(w, 'Select all 30 matching this filter').trigger('click');
    await flushPromises();
    expect(bulkBar(w).text()).toContain('30 selected');

    mocked.bulkUpdateReceipts.mockResolvedValue({ updated: 30, commented: 0, unknown: [] });
    await barButton(w, 'Archive').trigger('click');
    await flushPromises();

    // ONE call carrying the COMPLETE population — bulkUpdateReceipts itself
    // owns splitting >BULK_MAX ids into batches (src/api/__tests__/
    // receipts.bulk.spec.ts proves the chunking, incl. for set_archived).
    expect(mocked.bulkUpdateReceipts).toHaveBeenCalledTimes(1);
    const [ids, actions] = mocked.bulkUpdateReceipts.mock.calls[0];
    expect(sorted(ids)).toEqual(sorted(ALL_30));
    expect(ids.length).toBe(30);
    expect(actions).toEqual({ set_archived: true });
    expect(newToasts().some((t) => t.tone === 'success' && t.message.includes('Updated 30 receipts'))).toBe(true);
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Toolbar count / total are server truth ──────────────────────────────────

describe('AuditReceipts archive — toolbar totals are the server totals', () => {
  it('count and sum come from `totals` of the archived-excluding request, not from the visible rows', async () => {
    // 3 visible rows (sum ≈ R21 600) but the SERVER says the working set —
    // with archived rows excluded — is 30 receipts / R999 999.99.
    mocked.getReceipts.mockResolvedValue(
      listResponse(page1Rows(), { count: 30, sum_total: '999999.99' }),
    );

    const w = mountPage();
    await flushPromises();

    // The request this label describes carried NO archived param (excluded).
    expect(mocked.getReceipts.mock.calls[0][0]).not.toHaveProperty('archived');
    expect(w.text()).toContain('Showing 1–30 of 30 receipts');
    expect(w.text().replace(/[\u00a0\u202f]/g, ' ')).toMatch(/Total R\s?999\s?999[.,]99/);
    // The naive visible-row sum must NOT be shown anywhere.
    expect(w.text().replace(/[\u00a0\u202f]/g, ' ')).not.toMatch(/Total R\s?21\s?600/);
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Inline commenting with an active bulk selection ─────────────────────────

describe('AuditReceipts archive — inline comment while a bulk selection is active', () => {
  it('posting from a row comment cell bumps that row count, keeps the selection, and triggers NO reload', async () => {
    mocked.postReceiptComment.mockResolvedValue({ id: 9, text: 'triage note', author: 'mc', created_at: '2026-08-20T06:00:00Z' });

    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('3 selected');
    expect(cellFor(w, bodyRows(w)[0], 'Comments').text()).toBe('0');

    // Open row 0's comment popover — must NOT open the detail modal.
    await bodyRows(w)[0].get('[data-test="inline-comment-trigger"]').trigger('click');
    await flushPromises();
    expect(modalEl()).toBeNull();

    const input = document.body.querySelector<HTMLInputElement>('[data-test="inline-comment-input"]')!;
    expect(input).not.toBeNull();
    input.value = '  triage note ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(mocked.postReceiptComment).toHaveBeenCalledTimes(1);
    expect(mocked.postReceiptComment).toHaveBeenCalledWith(P1_SHAS[0], 'triage note');

    // The row count bumped in the table WITHOUT a list reload…
    expect(cellFor(w, bodyRows(w)[0], 'Comments').text()).toBe('1');
    expect(cellFor(w, bodyRows(w)[2], 'Comments').text()).toBe('2'); // neighbours untouched
    expect(mocked.getReceipts).toHaveBeenCalledTimes(1);
    // …and the bulk selection is intact.
    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).toContain('3 selected');
    // Only the cell's own lazy thread fetch hit getReceipt — no modal fetch.
    expect(mocked.getReceipt).toHaveBeenCalledTimes(1);
    expect(mocked.getReceipt).toHaveBeenCalledWith(P1_SHAS[0]);
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Regression guard: the modal save never sends `decision` ─────────────────

describe('AuditReceipts archive — modal save must not send decision', () => {
  it("saving the review PATCHes { note } ONLY — never a decision key (decision:'' would wipe stored data)", async () => {
    // The clicked row HAS a stored decision — exactly the row a stray
    // decision:'' would destroy.
    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[2].trigger('click');
    await flushPromises();
    const dlg = modalEl();
    expect(dlg).not.toBeNull();

    const noteTa = dlg!.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Why this decision"]');
    expect(noteTa).not.toBeNull();
    expect(noteTa!.value).toBe('existing note');
    noteTa!.value = 'existing note — checked against the bank statement';
    noteTa!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    const saveBtn = [...dlg!.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Save review')!;
    expect(saveBtn.disabled).toBe(false);
    saveBtn.click();
    await flushPromises();

    expect(mocked.patchReceiptReview).toHaveBeenCalledTimes(1);
    const [sha, body] = mocked.patchReceiptReview.mock.calls[0];
    expect(sha).toBe(P1_SHAS[2]);
    expect(body).toEqual({ note: 'existing note — checked against the bank statement' });
    expect(Object.prototype.hasOwnProperty.call(body, 'decision')).toBe(false);

    // Belt and braces: NO patch in this whole flow ever carried a decision key.
    for (const call of mocked.patchReceiptReview.mock.calls) {
      expect(Object.prototype.hasOwnProperty.call(call[1], 'decision')).toBe(false);
    }
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Auditor mode (read-only role) ───────────────────────────────────────────

describe('AuditReceipts — auditor mode', () => {
  beforeEach(() => {
    mockAuth.isAuditor = true;
    mockAuth.user = { role: 'auditor' };
  });

  afterEach(() => {
    mockAuth.isAuditor = false;
    mockAuth.user = { role: 'standard' };
  });

  it('renders no checkboxes, no Archive buttons, disabled to-process toggles; View intact', async () => {
    const w = mountPage();
    await flushPromises();

    expect(w.findAll('tbody input.ktable-checkbox').length).toBe(0);
    const buttons = w.findAll('tbody button');
    expect(buttons.some((b) => b.text() === 'Archive' || b.text() === 'Restore')).toBe(false);
    expect(buttons.some((b) => b.text() === 'View')).toBe(true);
    // Every to-process toggle is disabled (KToggle renders a Reka switch).
    const toggles = w.findAll('tbody .ktoggle-track');
    expect(toggles.length).toBeGreaterThan(0);
    for (const t of toggles) {
      expect(t.classes()).toContain('ktoggle-track--disabled');
    }
    expect(w.find('.ar-bulk-bar').exists()).toBe(false);
    w.unmount();
  });
});
