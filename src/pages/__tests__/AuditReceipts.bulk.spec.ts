// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditReceipts.bulk.spec.ts
 *
 * Adversarial mount-based spec for the BULK-ACTIONS feature on the
 * Audit → Receipts console page (src/pages/AuditReceipts.vue).
 *
 * Same harness as AuditReceipts.modal.spec.ts: mount the REAL page (KTable /
 * KDialog / KToggle / bulk bar all real), mock only src/api/receipts
 * and vue-router. Fixtures mirror hostile production shapes — journal: null,
 * total: null, a row with NO review block at all, non-numeric totals, and a
 * 200-row page.
 *
 * The two highest-value properties here:
 *   - CROSS-PAGE selection is keyed by sha256, not row position. If the
 *     `id: r.sha256` alias in load() is ever removed, KTable's frozen
 *     getRowId falls back to the row INDEX and a bulk action would silently
 *     hit the wrong receipts on other pages. The cross-page test asserts the
 *     POSTed sha256s are the PAGE-1 hashes after navigating to page 2.
 *   - Optimistic bulk state REVERTS on failure — for to_process and for
 *     set_archived — with the partial-progress detail surfaced and NO refetch
 *     on the failure path (the snapshot is the truth).
 *
 * The bulk Decision menu was REMOVED with the decision control (2026-08-20);
 * its tests went with it. Bulk Archive / Restore bodies and the archived
 * filter live in AuditReceipts.archive.spec.ts.
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

// The page polls the live comment feed (useCommentFeed). Mocked to a silent
// no-op: these specs are about the page, and an unmocked poll would make a
// real HTTP request from the test run.
vi.mock('../../api/comments', () => ({
  getCommentFeed: vi.fn().mockResolvedValue({ now: null, events: [] }),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ replace: routerReplace }),
}));

import * as api from '../../api/receipts';
import AuditReceipts from '../AuditReceipts.vue';
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

// ── Fixtures — hostile production shapes ────────────────────────────────────

const DEFAULT_REVIEW = { to_process: false, decision: '', note: '', updated_by: '', updated_at: null };

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
const P2_SHAS = ['d'.repeat(64), 'e'.repeat(64), 'f'.repeat(64)];

function page1Rows() {
  return [
    row(P1_SHAS[0], {
      supplier: 'Makro',
      total: '21600.00',
      synced_to_xero: true,
      status_group: 'MATCHED',
      xero_status: 'MATCHED',
      journal: { journal_number: 1042, date: '2026-08-05', contact_name: 'Makro', account_code: '6100', account_name: 'Equipment', amount: '21600.00', description: 'Makro slip' },
    }),
    // Hostile: no review block AT ALL, null total, no OCR supplier.
    row(P1_SHAS[1], { supplier: null, total: null, category: null, review: undefined, status_group: 'NOT IN XERO', xero_status: 'NOT IN XERO' }),
    // Hostile: non-numeric total leak + a real decision already set.
    row(P1_SHAS[2], { supplier: 'Spar', total: 'R 1 234,56', review: { ...DEFAULT_REVIEW, decision: 'CAPTURE' }, comment_count: 2 }),
  ];
}

function page2Rows() {
  return [
    row(P2_SHAS[0], { supplier: 'Engen' }),
    row(P2_SHAS[1], { supplier: 'Checkers', total: null }),
    row(P2_SHAS[2], { supplier: 'Woolworths', review: { ...DEFAULT_REVIEW, to_process: true } }),
  ];
}

function listResponse(results: unknown[], { count = results.length, num_pages = 1, page = 1, page_size = 50 } = {}) {
  return {
    count,
    page,
    page_size,
    num_pages,
    totals: { count, sum_total: '23023.50' },
    results,
  };
}

/** getReceipts implementation serving page 1 / page 2 fixtures. */
function servePaged({ count = 30, num_pages = 2, page_size = 25 } = {}) {
  mocked.getReceipts.mockImplementation(async (params: Record<string, unknown>) => {
    const page = Number(params?.page) || 1;
    return listResponse(page === 2 ? page2Rows() : page1Rows(), { count, num_pages, page, page_size });
  });
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

function dialogEl(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]');
}

function bodyRows(w: ReturnType<typeof mount>) {
  return w.findAll('tbody tr');
}

function rowCheckboxes(w: ReturnType<typeof mount>) {
  return w.findAll('tbody input.ktable-checkbox');
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

/** Sorted copy — selection Sets have no order contract. */
const sorted = (a: string[]) => [...a].sort();

/** Header-relative cell lookup (same rationale as the modal spec). */
function cellFor(w: ReturnType<typeof mount>, rowWrapper: ReturnType<typeof bodyRows>[number], label: string) {
  const idx = w.findAll('thead th').findIndex((th) => th.text().trim() === label);
  if (idx === -1) throw new Error(`No <th> labelled "${label}"`);
  return rowWrapper.findAll('td')[idx];
}

const toast = useToast();
let toastBaseline: number;

beforeEach(() => {
  warnings = [];
  toastBaseline = toast.toasts.value.length;
  routerReplace.mockReset();
  for (const k of Object.keys(routeQuery)) delete routeQuery[k];
  mocked.getReceipts.mockReset().mockResolvedValue(listResponse(page1Rows()));
  mocked.getReceipt.mockReset().mockImplementation(async (sha: string) => ({ ...row(sha), items: [], comments: [] }));
  mocked.getReceiptIds.mockReset();
  mocked.patchReceiptReview.mockReset();
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

// ── Bulk bar visibility + selection basics ──────────────────────────────────

describe('AuditReceipts bulk — bar visibility and row selection', () => {
  it('no bulk bar when nothing is selected; it appears with the right count when a row checkbox is ticked', async () => {
    const w = mountPage();
    await flushPromises();

    expect(bulkBar(w).exists()).toBe(false);
    // A checkbox column exists (selectable KTable) — one per row + header.
    expect(rowCheckboxes(w).length).toBe(3);

    await rowCheckboxes(w)[0].setValue(true);
    await nextTick();

    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).toContain('1 selected');

    await rowCheckboxes(w)[2].setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('2 selected');

    // Unticking shrinks it back; unticking the last hides the bar.
    await rowCheckboxes(w)[2].setValue(false);
    await nextTick();
    expect(bulkBar(w).text()).toContain('1 selected');
    await rowCheckboxes(w)[0].setValue(false);
    await nextTick();
    expect(bulkBar(w).exists()).toBe(false);

    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('ticking a row checkbox does NOT open the detail modal (KTable @click.stop on the select cell)', async () => {
    const w = mountPage();
    await flushPromises();

    // A real bubbling click on the checkbox element — the row-click handler
    // must not see it.
    await rowCheckboxes(w)[1].trigger('click');
    await flushPromises();

    expect(dialogEl()).toBeNull();
    expect(mocked.getReceipt).not.toHaveBeenCalled();

    // Control: clicking the row itself DOES open the modal.
    await bodyRows(w)[1].trigger('click');
    await flushPromises();
    expect(dialogEl()).not.toBeNull();
    w.unmount();
  });

  it('the header select-all selects exactly the rows on the current page and the count matches', async () => {
    const w = mountPage();
    await flushPromises();

    await headerCheckbox(w).setValue(true);
    await nextTick();

    expect(bulkBar(w).text()).toContain('3 selected');
    for (const cb of rowCheckboxes(w)) {
      expect((cb.element as HTMLInputElement).checked).toBe(true);
    }

    // And it is the page's sha256s that got selected — proven by the bulk POST.
    await barButton(w, 'To process ✓').trigger('click');
    await flushPromises();
    expect(mocked.bulkUpdateReceipts).toHaveBeenCalledTimes(1);
    expect(sorted(mocked.bulkUpdateReceipts.mock.calls[0][0])).toEqual(sorted(P1_SHAS));

    // Untick select-all empties the selection.
    await headerCheckbox(w).setValue(false);
    await nextTick();
    expect(bulkBar(w).exists()).toBe(false);
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('a 200-row page renders without Vue warnings and select-all ticks all 200', async () => {
    const many = Array.from({ length: 200 }, (_, i) => {
      const sha = String(i).padStart(4, '0').repeat(16);
      // Sprinkle hostile shapes through the big page.
      return row(sha, {
        total: i % 7 === 0 ? null : `${i}.00`,
        supplier: i % 13 === 0 ? null : `Supplier ${i}`,
        review: i % 11 === 0 ? undefined : { ...DEFAULT_REVIEW, to_process: i % 2 === 0 },
        journal: i % 3 === 0 ? { journal_number: i, date: '2026-08-05', contact_name: 'X', account_code: '6100', account_name: 'Eq', amount: `${i}.00`, description: '' } : null,
      });
    });
    routeQuery.page_size = '200';
    mocked.getReceipts.mockResolvedValue(listResponse(many, { count: 200, page_size: 200 }));

    const w = mountPage();
    await flushPromises();

    expect(bodyRows(w).length).toBe(200);
    expect(warnings).toEqual([]);

    await headerCheckbox(w).setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('200 selected');
    const boxes = rowCheckboxes(w);
    expect(boxes.length).toBe(200);
    expect(boxes.every((cb) => (cb.element as HTMLInputElement).checked)).toBe(true);
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Cross-page selection ────────────────────────────────────────────────────

describe('AuditReceipts bulk — selection survives paging and is sha256-keyed', () => {
  it('selection survives a page change and a bulk action posts the PAGE-1 sha256s (not row positions)', async () => {
    routeQuery.page_size = '25';
    servePaged();

    const w = mountPage();
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 1, page_size: 25 });

    await headerCheckbox(w).setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('3 selected');

    // → page 2
    await w.get('[aria-label="Next page"]').trigger('click');
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 2, page_size: 25 });
    expect(bodyRows(w)[0].text()).toContain('Engen');

    // The selection is unchanged — same count, bar still up…
    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).toContain('3 selected');
    // …and the page-2 rows are NOT selected. If selection were keyed by row
    // index ('0','1','2'), all three page-2 checkboxes would light up here.
    for (const cb of rowCheckboxes(w)) {
      expect((cb.element as HTMLInputElement).checked).toBe(false);
    }
    expect((headerCheckbox(w).element as HTMLInputElement).checked).toBe(false);

    // The bulk action posts the PAGE-1 hashes. This is the assertion that
    // goes red if `id: r.sha256` is ever dropped from load().
    mocked.bulkUpdateReceipts.mockResolvedValue({ updated: 3, commented: 0, unknown: [] });
    await barButton(w, 'To process ✓').trigger('click');
    await flushPromises();

    expect(mocked.bulkUpdateReceipts).toHaveBeenCalledTimes(1);
    const [postedIds, actions] = mocked.bulkUpdateReceipts.mock.calls[0];
    expect(sorted(postedIds)).toEqual(sorted(P1_SHAS));
    for (const sha of P2_SHAS) expect(postedIds).not.toContain(sha);
    expect(actions).toEqual({ set_to_process: true });
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('changing a FILTER clears the selection; changing only the page size does not', async () => {
    const w = mountPage();
    await flushPromises();

    await headerCheckbox(w).setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('3 selected');

    // Page-size change → selection kept (page_size is excluded from the
    // filter signature).
    await w.get('.ktpag__size-select').setValue('100');
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 1, page_size: 100 });
    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).toContain('3 selected');

    // Real filter change → selection cleared.
    (w.vm as unknown as { filters: Record<string, unknown> }).filters.status = 'PENDING';
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ status: 'PENDING', page: 1, page_size: 100 });
    expect(bulkBar(w).exists()).toBe(false);
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Select all N matching the filter ────────────────────────────────────────

describe('AuditReceipts bulk — "Select all N matching this filter"', () => {
  // The ids response for the filter INCLUDES the rows currently visible —
  // they match the filter by definition. 3 visible + 27 off-page = 30.
  const ALL_30 = [...P1_SHAS, ...Array.from({ length: 27 }, (_, i) => `${String(i).padStart(2, '0')}${'9'.repeat(62)}`)];

  it('appears only when every visible row is selected AND totals.count exceeds the page; clicking selects the whole filter', async () => {
    routeQuery.page_size = '25';
    routeQuery.status = 'PENDING';
    servePaged();
    mocked.getReceiptIds.mockResolvedValue({ count: 30, sha256s: ALL_30, truncated: false });

    const w = mountPage();
    await flushPromises();

    // Partial selection → no "Select all" affordance.
    await rowCheckboxes(w)[0].setValue(true);
    await nextTick();
    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).not.toContain('Select all');

    // Full page selected → the button appears with the server total.
    await headerCheckbox(w).setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('Select all 30 matching this filter');

    await barButton(w, 'Select all 30 matching this filter').trigger('click');
    await flushPromises();

    // Non-paging filter params only — page / page_size must NOT leak in.
    expect(mocked.getReceiptIds).toHaveBeenCalledTimes(1);
    expect(mocked.getReceiptIds).toHaveBeenCalledWith({ status: 'PENDING' });

    expect(bulkBar(w).text()).toContain('30 selected');
    // Now count === totals.count → the button is gone.
    expect(bulkBar(w).text()).not.toContain('Select all 30');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('truncated: true raises a warning toast and still selects what came back', async () => {
    routeQuery.page_size = '25';
    servePaged();
    // 20 ids came back (includes the visible 3) before the server cut off.
    const partial = [...P1_SHAS, ...Array.from({ length: 17 }, (_, i) => `${String(i).padStart(2, '0')}${'8'.repeat(62)}`)];
    mocked.getReceiptIds.mockResolvedValue({ count: 30, sha256s: partial, truncated: true });

    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    await barButton(w, 'Select all 30 matching this filter').trigger('click');
    await flushPromises();

    expect(bulkBar(w).text()).toContain('20 selected');
    const warns = newToasts().filter((t) => t.tone === 'warning');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toContain('more than 2000');
    w.unmount();
  });

  it('a failing ids fetch surfaces an error and keeps the page selection intact', async () => {
    routeQuery.page_size = '25';
    servePaged();
    mocked.getReceiptIds.mockRejectedValue(new Error('500'));

    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    await barButton(w, 'Select all 30 matching this filter').trigger('click');
    await flushPromises();

    expect(w.text()).toContain('Selecting all matching receipts failed.');
    expect(bulkBar(w).text()).toContain('3 selected');
    w.unmount();
  });
});

// ── Bar actions — exact POST bodies ─────────────────────────────────────────

describe('AuditReceipts bulk — action bodies', () => {
  async function mountSelected() {
    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    mocked.bulkUpdateReceipts.mockResolvedValue({ updated: 3, commented: 0, unknown: [] });
    return w;
  }

  it('To process ✓ → {set_to_process: true}; To process ✗ → {set_to_process: false}', async () => {
    const w = await mountSelected();

    await barButton(w, 'To process ✓').trigger('click');
    await flushPromises();
    expect(mocked.bulkUpdateReceipts.mock.calls.at(-1)![1]).toEqual({ set_to_process: true });

    await barButton(w, 'To process ✗').trigger('click');
    await flushPromises();
    expect(mocked.bulkUpdateReceipts.mock.calls.at(-1)![1]).toEqual({ set_to_process: false });
    expect(warnings).toEqual([]);
    w.unmount();
  });

});

// ── Bulk comment dialog ─────────────────────────────────────────────────────

describe('AuditReceipts bulk — comment dialog', () => {
  it('posts {comment: text}, is disabled on whitespace-only input, and closes on success', async () => {
    // The page refetches after a successful bulk action (server truth wins
    // over the optimistic bump), so the mock server must return the bumped
    // comment counts on calls AFTER the bulk succeeded.
    let commented = false;
    mocked.getReceipts.mockImplementation(async () => {
      const rows = page1Rows().map((r) => (commented ? { ...r, comment_count: (r.comment_count as number) + 1 } : r));
      return listResponse(rows);
    });

    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();

    await barButton(w, 'Add comment…').trigger('click');
    await nextTick();
    await flushPromises();

    const dlg = dialogEl();
    expect(dlg).not.toBeNull();
    expect(dlg!.textContent).toContain('The comment will be added to 3 selected receipts.');

    const ta = dlg!.querySelector('textarea')!;
    const addBtn = [...dlg!.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Add')!;
    expect(addBtn).toBeTruthy();

    // Whitespace-only → disabled.
    ta.value = '   \n\t ';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(addBtn.disabled).toBe(true);

    // Real text → enabled → posts the trimmed comment.
    mocked.bulkUpdateReceipts.mockImplementation(async () => {
      commented = true;
      return { updated: 0, commented: 3, unknown: [] };
    });
    ta.value = '  Chase the VAT invoice  ';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(addBtn.disabled).toBe(false);

    addBtn.click();
    await flushPromises();
    await nextTick();

    expect(mocked.bulkUpdateReceipts).toHaveBeenCalledTimes(1);
    const [postedIds, actions] = mocked.bulkUpdateReceipts.mock.calls[0];
    expect(sorted(postedIds)).toEqual(sorted(P1_SHAS));
    expect(actions).toEqual({ comment: 'Chase the VAT invoice' });

    // Dialog closed on success; comment counts bumped on the visible rows.
    expect(dialogEl()).toBeNull();
    expect(cellFor(w, bodyRows(w)[0], 'Comments').text()).toBe('1');
    expect(cellFor(w, bodyRows(w)[2], 'Comments').text()).toBe('3');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('stays open (and keeps the draft) when the bulk comment POST fails', async () => {
    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    await barButton(w, 'Add comment…').trigger('click');
    await nextTick();
    await flushPromises();

    const dlg = dialogEl()!;
    const ta = dlg.querySelector('textarea')!;
    ta.value = 'important note';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    mocked.bulkUpdateReceipts.mockRejectedValue(new Error('500'));
    [...dlg.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Add')!.click();
    await flushPromises();
    await nextTick();

    expect(dialogEl()).not.toBeNull();
    expect((dialogEl()!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('important note');
    expect(w.text()).toContain('Bulk update failed');
    w.unmount();
  });
});

// ── Optimistic apply / revert + selection persistence ───────────────────────

describe('AuditReceipts bulk — optimistic revert and selection persistence', () => {
  it('when a bulk TO-PROCESS rejects, rows revert to their previous to_process state and an error is surfaced', async () => {
    let rejectBulk!: (e: Error) => void;
    mocked.bulkUpdateReceipts.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectBulk = reject; }),
    );

    const w = mountPage();
    await flushPromises();

    // Pre-state: row0 toggle OFF.
    expect(bodyRows(w)[0].get('[role="switch"]').attributes('aria-checked')).toBe('false');

    await headerCheckbox(w).setValue(true);
    await nextTick();
    await barButton(w, 'To process ✓').trigger('click');
    await nextTick();

    // Optimistic: every selected row's toggle flips ON while in flight.
    expect(bodyRows(w)[0].get('[role="switch"]').attributes('aria-checked')).toBe('true');
    expect(bodyRows(w)[1].get('[role="switch"]').attributes('aria-checked')).toBe('true');

    const err = new Error('server exploded') as Error & { partial?: unknown };
    err.partial = { updated: 500, commented: 0, unknown: [], batchesDone: 1, batchesTotal: 3 };
    rejectBulk(err);
    await flushPromises();

    // Reverted in the DOM.
    expect(bodyRows(w)[0].get('[role="switch"]').attributes('aria-checked')).toBe('false');
    expect(bodyRows(w)[1].get('[role="switch"]').attributes('aria-checked')).toBe('false');
    // The stored decision DATA on row2 survived the snapshot/revert cycle
    // (the decision UI is gone; the field is not).
    expect(((w.vm as any).rows[2] as { review: { decision: string } }).review.decision).toBe('CAPTURE');

    // Error surfaced — with the partial-progress detail.
    expect(w.text()).toContain('Bulk update failed');
    expect(w.text()).toContain('1 of 3 batches applied');
    const errToasts = newToasts().filter((t) => t.tone === 'error');
    expect(errToasts.length).toBe(1);

    // No refetch happened on the failure path — the snapshot is the truth.
    expect(mocked.getReceipts).toHaveBeenCalledTimes(1);
    // Selection is kept so the user can retry.
    expect(bulkBar(w).text()).toContain('3 selected');
    w.unmount();
  });

  it('when a bulk ARCHIVE rejects, the optimistic "Archived" pills revert and no refetch happens', async () => {
    let rejectBulk!: (e: Error) => void;
    mocked.bulkUpdateReceipts.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectBulk = reject; }),
    );

    const w = mountPage();
    await flushPromises();

    // Pre-state: no row is archived. (Scoped to the supplier cells — the
    // filter bar's own "Archived" select label would trip a whole-page check.)
    for (const tr of bodyRows(w)) {
      expect(cellFor(w, tr, 'Supplier').text()).not.toContain('Archived');
    }

    await headerCheckbox(w).setValue(true);
    await nextTick();
    await barButton(w, 'Archive').trigger('click');
    await nextTick();

    expect(mocked.bulkUpdateReceipts).toHaveBeenCalledTimes(1);
    expect(mocked.bulkUpdateReceipts.mock.calls[0][1]).toEqual({ set_archived: true });

    // Optimistic while in flight: every selected row shows the Archived pill
    // in its supplier cell, and the per-row action flips to Restore.
    for (const tr of bodyRows(w)) {
      expect(cellFor(w, tr, 'Supplier').text()).toContain('Archived');
      expect(tr.findAll('button').some((b) => b.text() === 'Restore')).toBe(true);
    }

    const err = new Error('500') as Error & { partial?: unknown };
    err.partial = { updated: 0, commented: 0, unknown: [], batchesDone: 0, batchesTotal: 1 };
    rejectBulk(err);
    await flushPromises();

    // Reverted in the DOM — no pill, per-row action back to Archive.
    for (const tr of bodyRows(w)) {
      expect(cellFor(w, tr, 'Supplier').text()).not.toContain('Archived');
      expect(tr.findAll('button').some((b) => b.text() === 'Archive')).toBe(true);
      expect(tr.findAll('button').some((b) => b.text() === 'Restore')).toBe(false);
    }

    // Error surfaced; NO refetch on failure (the reverted snapshot is the truth
    // — reloading under the default 'hide' filter would vanish rows that were
    // never actually archived server-side).
    expect(w.text()).toContain('Bulk update failed');
    expect(mocked.getReceipts).toHaveBeenCalledTimes(1);
    // Selection kept for retry.
    expect(bulkBar(w).text()).toContain('3 selected');
    w.unmount();
  });

  it('selection is KEPT after a successful bulk action (chainable); Clear selection empties it', async () => {
    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();

    mocked.bulkUpdateReceipts.mockResolvedValue({ updated: 3, commented: 0, unknown: [] });
    await barButton(w, 'To process ✓').trigger('click');
    await flushPromises();

    // Success toast + resynced from the server (a second getReceipts call).
    expect(newToasts().some((t) => t.tone === 'success' && t.message.includes('Updated 3 receipts'))).toBe(true);
    expect(mocked.getReceipts).toHaveBeenCalledTimes(2);

    // Still selected → a second action can be chained immediately.
    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).toContain('3 selected');
    await barButton(w, 'To process ✗').trigger('click');
    await flushPromises();
    expect(mocked.bulkUpdateReceipts).toHaveBeenCalledTimes(2);
    expect(sorted(mocked.bulkUpdateReceipts.mock.calls[1][0])).toEqual(sorted(P1_SHAS));

    await barButton(w, 'Clear selection').trigger('click');
    await nextTick();
    expect(bulkBar(w).exists()).toBe(false);
    for (const cb of rowCheckboxes(w)) {
      expect((cb.element as HTMLInputElement).checked).toBe(false);
    }
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('unknown sha256s in the aggregate raise a warning toast', async () => {
    const w = mountPage();
    await flushPromises();
    await headerCheckbox(w).setValue(true);
    await nextTick();
    mocked.bulkUpdateReceipts.mockResolvedValue({ updated: 2, commented: 0, unknown: [P1_SHAS[1]] });
    await barButton(w, 'To process ✓').trigger('click');
    await flushPromises();
    const warns = newToasts().filter((t) => t.tone === 'warning');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toContain('not recognised by the server');
    w.unmount();
  });
});

// ── Page size ───────────────────────────────────────────────────────────────

describe('AuditReceipts bulk — page size selector', () => {
  it('offers 25/50/100/200; choosing 200 refetches page 1 with page_size 200 and keeps the selection', async () => {
    const w = mountPage();
    await flushPromises();

    const select = w.get('.ktpag__size-select');
    expect(select.findAll('option').map((o) => o.text())).toEqual(['25', '50', '100', '200']);

    await rowCheckboxes(w)[0].setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('1 selected');

    await select.setValue('200');
    await flushPromises();

    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 1, page_size: 200 });
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { page_size: '200' } });
    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).toContain('1 selected');
    expect(warnings).toEqual([]);
    w.unmount();
  });
});
