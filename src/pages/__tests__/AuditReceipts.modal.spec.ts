// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditReceipts.modal.spec.ts
 *
 * Mount-based spec for src/pages/AuditReceipts.vue — the Audit → Receipts
 * console page plus its detail modal.
 *
 * Strategy: mount the REAL page (AppPage / PageHeader / FilterBar / KTable /
 * KDialog / KToggle / KSelect are all real), mock only the API module
 * (src/api/receipts.js) and vue-router (useRoute / useRouter). Fixtures mirror
 * production row shapes — `journal: null`, `total: null`, non-numeric totals,
 * OCR-less rows, default-shaped review blocks, a very long supplier string.
 *
 * What is verified:
 *   - the page fetches on mount and renders one <tr> per result, with no Vue
 *     warnings, for the realistic (hostile) fixture set
 *   - null / non-numeric totals render '—'; journal:null does not throw in the
 *     Xero cell; unmatched rows show no journal sub-line
 *   - the modal is closed on mount; opens on row click / View; calls
 *     getReceipt(sha256); closes again and the open state resets
 *   - PDF vs image branch renders <iframe> vs <img src=view_url>
 *   - opening a SECOND receipt after closing the first shows the second's data
 *     (drafts tracked via noteDraft — the note is the only review draft left)
 *   - KToggle → patchReceiptReview(sha, { to_process: true }); when the PATCH
 *     rejects, the optimistic toggle reverts and an error alert is raised —
 *     and the revert restores the row's stored decision/note DATA untouched
 *     (`review.decision` still exists as data; only its UI control was removed
 *     on 2026-08-20 — see AuditReceipts.archive.spec.ts for the no-decision-UI
 *     and archive-flow coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../api/receipts', () => ({
  // Keep in sync with the real module's server-side batch cap.
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
// The detail dialogs render ObjectActivity (standard users). Mocked so these
// specs stay about the page and make no real HTTP request.
vi.mock('../../api/activity', () => ({
  listActivity: vi.fn().mockResolvedValue({ count: 0, results: [] }),
  listObjectActivity: vi.fn().mockResolvedValue({ count: 0, results: [] }),
  listActivityActors: vi.fn().mockResolvedValue([]),
  listActivityActions: vi.fn().mockResolvedValue([]),
  exportActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../api/comments', () => ({
  getCommentFeed: vi.fn().mockResolvedValue({ now: null, events: [] }),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ replace: routerReplace }),
}));

import * as api from '../../api/receipts';
import AuditReceipts from '../AuditReceipts.vue';

const mocked = api as unknown as {
  getReceipts: ReturnType<typeof vi.fn>;
  getReceipt: ReturnType<typeof vi.fn>;
  getReceiptIds: ReturnType<typeof vi.fn>;
  patchReceiptReview: ReturnType<typeof vi.fn>;
  postReceiptComment: ReturnType<typeof vi.fn>;
  bulkUpdateReceipts: ReturnType<typeof vi.fn>;
  downloadReceiptsExport: ReturnType<typeof vi.fn>;
};

// ── Fixtures — production-shaped rows ───────────────────────────────────────

const DEFAULT_REVIEW = { to_process: false, decision: '', note: '', updated_by: '', updated_at: null };

function row(overrides: Record<string, unknown> = {}) {
  return {
    sha256: 'a'.repeat(64),
    filename: 'IMG_0001.jpg',
    mime: 'image/jpeg',
    mime_ext: 'jpg',
    is_pdf: false,
    byte_size: 123456,
    view_url: '/backend/audit/receipts/aaaa/view/',
    slip_ts: '2026-08-04T10:00:00Z',
    fy: 'FY27',
    supplier: 'Makro',
    total: '21600.00',
    category: 'Equipment',
    slip_date: '2026-08-04',
    payment_method: 'Card',
    source: 'whatsapp',
    synced_to_xero: true,
    xero_status: 'MATCHED (auto-recon 2026-08-17)',
    status_group: 'MATCHED',
    xero_detail: null,
    xero_org: 'Klikk',
    journal: {
      journal_number: 1042,
      date: '2026-08-05',
      contact_name: 'Makro',
      account_code: '6100',
      account_name: 'Equipment',
      amount: '21600.00',
      description: 'Makro slip',
    },
    review: { ...DEFAULT_REVIEW },
    comment_count: 0,
    ...overrides,
  };
}

const SHA_MATCHED = 'a'.repeat(64);
const SHA_UNMATCHED = 'b'.repeat(64);
const SHA_NULL_TOTAL = 'c'.repeat(64);
const SHA_NAN_TOTAL = 'd'.repeat(64);
const SHA_NO_OCR = 'e'.repeat(64);
const SHA_SKIPPED = 'f'.repeat(64);
const SHA_PDF = '0'.repeat(64);
const SHA_LONG = '1'.repeat(64);

const ROWS = [
  row({ sha256: SHA_MATCHED }),
  // Unmatched — 145+ production rows look like this.
  row({
    sha256: SHA_UNMATCHED,
    filename: 'IMG_0002.jpg',
    supplier: 'Checkers',
    total: '412.50',
    journal: null,
    synced_to_xero: false,
    xero_status: 'NOT IN XERO',
    status_group: 'NOT IN XERO',
  }),
  // total: null — API sends this for the 2 non-numeric OCR totals.
  row({ sha256: SHA_NULL_TOTAL, filename: 'IMG_0003.jpg', supplier: 'Engen', total: null, journal: null, status_group: 'PENDING', xero_status: 'PENDING' }),
  // Defensive: a non-numeric string total (should the API ever leak it).
  row({ sha256: SHA_NAN_TOTAL, filename: 'IMG_0004.jpg', supplier: 'Spar', total: 'R 1 234,56', journal: null, status_group: 'PENDING', xero_status: 'PENDING' }),
  // No OCR at all — supplier / category / slip_date / total all null.
  row({
    sha256: SHA_NO_OCR,
    filename: 'IMG_0005.jpg',
    supplier: null,
    category: null,
    slip_date: null,
    total: null,
    payment_method: null,
    journal: null,
    fy: null,
    slip_ts: null,
    status_group: 'SKIPPED',
    xero_status: 'skipped (no/negative total)',
    synced_to_xero: false,
  }),
  row({
    sha256: SHA_SKIPPED,
    filename: 'IMG_0006.jpg',
    supplier: 'Woolworths',
    total: '-50.00',
    journal: null,
    status_group: 'SKIPPED',
    xero_status: 'skipped (no/negative total)',
    review: { to_process: true, decision: 'MEAL_SKIP', note: 'lunch', updated_by: 'mc', updated_at: '2026-08-10T08:15:00Z' },
    comment_count: 3,
  }),
  // A PDF receipt.
  row({
    sha256: SHA_PDF,
    filename: 'invoice-77.pdf',
    mime: 'application/pdf',
    mime_ext: 'pdf',
    is_pdf: true,
    view_url: '/backend/audit/receipts/0000/view/',
    supplier: 'Takealot',
    total: '999.00',
    journal: null,
    status_group: 'PENDING',
    xero_status: 'PENDING',
  }),
  // Very long supplier string.
  row({
    sha256: SHA_LONG,
    filename: 'IMG_0008.jpg',
    supplier: 'THE VERY LONG TRADING NAME OF A SUPPLIER (PTY) LTD T/A SOMETHING ELSE ENTIRELY — BRANCH 0042 — '.repeat(3),
    total: '12.00',
    journal: null,
    status_group: 'PENDING',
    xero_status: 'PENDING',
  }),
];

function listResponse(results = ROWS, { num_pages = 1 } = {}) {
  return {
    count: results.length,
    page: 1,
    page_size: 50,
    num_pages,
    totals: { count: results.length, sum_total: '23023.50' },
    results,
  };
}

function detailResponse(sha: string, extra: Record<string, unknown> = {}) {
  const base = ROWS.find((r) => r.sha256 === sha)!;
  return {
    ...base,
    ocr: { supplier: base.supplier, total: base.total },
    items: [{ description: 'Line 1', amount: '10.00' }],
    comments: [],
    ...extra,
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

/** The dialog is teleported to <body>; query it from document. */
function dialogEl(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]');
}

function bodyRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('tbody tr');
}

/**
 * Header-relative cell lookup.
 *
 * KTable's `selectable` prop injects a leading `__select__` <td> into every
 * row, and any future column addition shifts positions again — hard-coded
 * `findAll('td')[n]` indexes are a trap. Resolve the column index from the
 * <th> label once, then index the row's tds by it, so this file survives the
 * next column change without edits.
 */
function headerIndex(wrapper: ReturnType<typeof mount>, label: string): number {
  const idx = wrapper.findAll('thead th').findIndex((th) => th.text().trim() === label);
  if (idx === -1) {
    throw new Error(`No <th> labelled "${label}" — did a column get renamed?`);
  }
  return idx;
}

function cellFor(
  wrapper: ReturnType<typeof mount>,
  rowWrapper: ReturnType<typeof bodyRows>[number],
  label: string,
) {
  const cells = rowWrapper.findAll('td');
  const idx = headerIndex(wrapper, label);
  if (idx >= cells.length) {
    throw new Error(`Row has ${cells.length} tds but "${label}" resolves to index ${idx}`);
  }
  return cells[idx];
}

beforeEach(() => {
  warnings = [];
  routerReplace.mockReset();
  for (const k of Object.keys(routeQuery)) delete routeQuery[k];
  mocked.getReceipts.mockReset().mockResolvedValue(listResponse());
  mocked.getReceipt.mockReset().mockImplementation(async (sha: string) => detailResponse(sha));
  mocked.patchReceiptReview.mockReset().mockImplementation(async (_sha: string, body: Record<string, unknown>) => ({ ...DEFAULT_REVIEW, ...body }));
  mocked.postReceiptComment.mockReset();
  mocked.getReceiptIds.mockReset();
  mocked.bulkUpdateReceipts.mockReset();
  mocked.downloadReceiptsExport.mockReset();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  document.body.innerHTML = '';
});

// ── Rendering realistic rows ────────────────────────────────────────────────

describe('AuditReceipts — renders production-shaped rows', () => {
  it('fetches on mount with default API params and renders one <tr> per result, with no Vue warnings', async () => {
    const w = mountPage();
    await flushPromises();

    expect(mocked.getReceipts).toHaveBeenCalledTimes(1);
    expect(mocked.getReceipts).toHaveBeenCalledWith({ page: 1, page_size: 50 });

    const trs = bodyRows(w);
    expect(trs.length).toBe(ROWS.length);
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('shows the count label and the sum_total badge from totals', async () => {
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain(`Showing 1–${ROWS.length} of ${ROWS.length} receipts`);
    // en-ZA currency format — assert the digits, not the exact NBSP layout.
    expect(w.text().replace(/[\u00a0\u202f]/g, ' ')).toMatch(/Total R\s?23\s?023[.,]50/);
    w.unmount();
  });

  it('renders — for null and non-numeric totals and for null supplier / category', async () => {
    const w = mountPage();
    await flushPromises();
    const trs = bodyRows(w);

    const nullTotalRow = trs[2];
    expect(nullTotalRow.text()).toContain('Engen');
    expect(cellFor(w, nullTotalRow, 'Total').text()).toBe('—');

    const nanTotalRow = trs[3];
    expect(cellFor(w, nanTotalRow, 'Total').text()).toBe('—');

    const noOcrRow = trs[4];
    expect(cellFor(w, noOcrRow, 'Date').text()).toContain('—');
    expect(cellFor(w, noOcrRow, 'Supplier').text()).toBe('—');
    expect(cellFor(w, noOcrRow, 'Total').text()).toBe('—');
    expect(cellFor(w, noOcrRow, 'Category').text()).toBe('—');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('Xero cell: journal:null renders the status pill with no journal sub-line; matched row shows #journal_number', async () => {
    const w = mountPage();
    await flushPromises();
    const trs = bodyRows(w);

    const matchedStatus = cellFor(w, trs[0], 'Xero status');
    expect(matchedStatus.text()).toContain('Matched');
    expect(matchedStatus.text()).toContain('#1042');
    expect(matchedStatus.find('.ar-status').attributes('title')).toBe('MATCHED (auto-recon 2026-08-17)');

    const unmatchedStatus = cellFor(w, trs[1], 'Xero status');
    expect(unmatchedStatus.text()).toContain('Not in Xero');
    expect(unmatchedStatus.text()).not.toContain('#');

    const skippedStatus = cellFor(w, trs[5], 'Xero status');
    expect(skippedStatus.text()).toContain('Skipped');
    expect(skippedStatus.find('.ar-status').attributes('title')).toBe('skipped (no/negative total)');
    w.unmount();
  });

  it('renders the very long supplier string and the FY sub-caption / comment count', async () => {
    const w = mountPage();
    await flushPromises();
    const trs = bodyRows(w);
    expect(trs[7].text()).toContain('THE VERY LONG TRADING NAME');
    expect(cellFor(w, trs[0], 'Date').text()).toContain('FY27');
    expect(cellFor(w, trs[0], 'Date').text()).toContain('2026-08-04');
    expect(cellFor(w, trs[5], 'Comments').text()).toBe('3');
    expect(cellFor(w, trs[0], 'Comments').text()).toBe('0');
    w.unmount();
  });

  it('reflects review.to_process in the row toggle (true → aria-checked=true)', async () => {
    const w = mountPage();
    await flushPromises();
    const trs = bodyRows(w);
    expect(trs[0].get('[role="switch"]').attributes('aria-checked')).toBe('false');
    expect(trs[5].get('[role="switch"]').attributes('aria-checked')).toBe('true');
    w.unmount();
  });

  it('shows the "No receipts yet" empty state when the API returns zero rows', async () => {
    mocked.getReceipts.mockResolvedValue(listResponse([]));
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('No receipts yet');
    expect(bodyRows(w).length).toBe(0);
    w.unmount();
  });

  it('shows the load error alert when the list call rejects', async () => {
    mocked.getReceipts.mockRejectedValue(new Error('boom'));
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('Could not load the receipt register.');
    w.unmount();
  });
});

// ── Modal open / close ──────────────────────────────────────────────────────

describe('AuditReceipts — detail modal open / close', () => {
  it('is closed on mount', async () => {
    const w = mountPage();
    await flushPromises();
    expect(dialogEl()).toBeNull();
    expect(mocked.getReceipt).not.toHaveBeenCalled();
    w.unmount();
  });

  it('opens on row click, calls getReceipt with that row\'s sha256, and shows the detail', async () => {
    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[1].trigger('click');
    await flushPromises();

    expect(mocked.getReceipt).toHaveBeenCalled();
    expect(mocked.getReceipt).toHaveBeenCalledWith(SHA_UNMATCHED);
    // Every call must be for the clicked row — never a neighbour.
    for (const call of mocked.getReceipt.mock.calls) expect(call[0]).toBe(SHA_UNMATCHED);

    const dlg = dialogEl();
    expect(dlg).not.toBeNull();
    expect(dlg!.textContent).toContain('Checkers');
    expect(dlg!.textContent).toContain('Unmatched');
    expect(dlg!.textContent).toContain('Line 1');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  // BUG (KTable, not AuditReceipts): src/components/klikk/KTable.vue declares
  // BOTH a prop `onRowClick` (line ~464) AND an emit 'row-click' (line ~477).
  // `<KTable @row-click="openDetail">` compiles to the vnode prop `onRowClick`,
  // which Vue matches to the declared prop; handleRowClick() (line ~636) then
  // calls `props.onRowClick(original)` AND `emit('row-click', original)` — and
  // emit() resolves the handler from the raw vnode props too — so every
  // consumer's row-click handler fires TWICE per click. On this page that
  // means two GET /audit/receipts/<sha>/ requests per row click and openDetail
  // re-running its state reset mid-flight. Same double-fire applies to
  // AuditProcedures / Comparison / FinancialInvestments row-clicks.
  // Fix belongs in KTable: drop the `onRowClick` prop (emit only) or stop
  // emitting when the prop is present.
  it.fails('row click calls getReceipt EXACTLY once (fails today — KTable double-fires row-click)', async () => {
    const w = mountPage();
    await flushPromises();
    await bodyRows(w)[1].trigger('click');
    await flushPromises();
    expect(mocked.getReceipt).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it('opens via the View button (click.stop — getReceipt called exactly once, not twice via row-click)', async () => {
    const w = mountPage();
    await flushPromises();

    const viewBtn = bodyRows(w)[0].findAll('button').find((b) => b.text() === 'View')!;
    await viewBtn.trigger('click');
    await flushPromises();

    expect(mocked.getReceipt).toHaveBeenCalledTimes(1);
    expect(mocked.getReceipt).toHaveBeenCalledWith(SHA_MATCHED);
    expect(dialogEl()).not.toBeNull();
    expect(dialogEl()!.textContent).toContain('#1042');
    w.unmount();
  });

  it('closes via the close button and the open state resets (no dialog in DOM, drafts cleared)', async () => {
    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[0].trigger('click');
    await flushPromises();
    expect(dialogEl()).not.toBeNull();

    const closeBtn = dialogEl()!.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.click();
    await flushPromises();
    await nextTick();

    expect(dialogEl()).toBeNull();
    // Internal state reset — detail is nulled when the dialog closes.
    expect((w.vm as any).detail).toBeNull();
    expect((w.vm as any).detailOpen).toBe(false);
    w.unmount();
  });

  it('image receipt renders <img src=view_url>; PDF receipt renders <iframe src=view_url>', async () => {
    const w = mountPage();
    await flushPromises();

    // Image
    await bodyRows(w)[0].trigger('click');
    await flushPromises();
    let dlg = dialogEl()!;
    const img = dlg.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('/backend/audit/receipts/aaaa/view/');
    expect(dlg.querySelector('iframe')).toBeNull();

    dlg.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();
    await flushPromises();
    await nextTick();
    expect(dialogEl()).toBeNull();

    // PDF
    await bodyRows(w)[6].trigger('click');
    await flushPromises();
    dlg = dialogEl()!;
    const iframe = dlg.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe('/backend/audit/receipts/0000/view/');
    expect(dlg.querySelector('img')).toBeNull();
    expect(dlg.textContent).toContain('invoice-77.pdf');
    w.unmount();
  });

  it('opening a SECOND receipt after closing the first shows the second one\'s data, not stale state', async () => {
    mocked.getReceipt.mockImplementation(async (sha: string) =>
      detailResponse(sha, {
        comments: sha === SHA_MATCHED
          ? [{ id: 1, text: 'first-receipt-comment', author: 'mc', created_at: '2026-08-10T08:00:00Z' }]
          : [],
        items: sha === SHA_MATCHED
          ? [{ description: 'ONLY-ON-FIRST', amount: '1.00' }]
          : [{ description: 'ONLY-ON-SECOND', amount: '2.00' }],
      }),
    );

    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[0].trigger('click');
    await flushPromises();
    let dlg = dialogEl()!;
    expect(dlg.textContent).toContain('Makro');
    expect(dlg.textContent).toContain('first-receipt-comment');
    expect(dlg.textContent).toContain('ONLY-ON-FIRST');

    dlg.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();
    await flushPromises();
    await nextTick();
    expect(dialogEl()).toBeNull();

    await bodyRows(w)[5].trigger('click');
    await flushPromises();
    dlg = dialogEl()!;
    expect(mocked.getReceipt).toHaveBeenLastCalledWith(SHA_SKIPPED);
    expect(dlg.textContent).toContain('Woolworths');
    expect(dlg.textContent).toContain('ONLY-ON-SECOND');
    expect(dlg.textContent).not.toContain('ONLY-ON-FIRST');
    expect(dlg.textContent).not.toContain('first-receipt-comment');
    expect(dlg.textContent).not.toContain('Makro');
    // The review draft follows the second receipt. (noteDraft is the only
    // review draft left — decisionDraft went with the decision control.)
    expect((w.vm as any).noteDraft).toBe('lunch');
    // Its review toggle is ON in the dialog.
    const dialogSwitch = dlg.querySelector('[role="switch"]');
    expect(dialogSwitch!.getAttribute('aria-checked')).toBe('true');
    w.unmount();
  });

  it('when getReceipt rejects the modal still opens with the list row and an action error is raised', async () => {
    mocked.getReceipt.mockRejectedValue(new Error('500'));
    const w = mountPage();
    await flushPromises();
    await bodyRows(w)[1].trigger('click');
    await flushPromises();
    expect(dialogEl()).not.toBeNull();
    expect(dialogEl()!.textContent).toContain('Checkers');
    expect(w.text()).toContain('Could not load the full receipt detail');
    w.unmount();
  });

  it('detail for an OCR-less row renders — placeholders without throwing', async () => {
    const w = mountPage();
    await flushPromises();
    await bodyRows(w)[4].trigger('click');
    await flushPromises();
    const dlg = dialogEl()!;
    expect(dlg.textContent).toContain('Receipt — —'); // title: supplier fallback + formatMoney(null)
    expect(dlg.textContent).toContain('Unmatched');
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── To-process toggle ───────────────────────────────────────────────────────

describe('AuditReceipts — to-process toggle', () => {
  it('toggling the row switch PATCHes { to_process: true } for that sha256 and keeps the optimistic state on success', async () => {
    const w = mountPage();
    await flushPromises();

    const sw = bodyRows(w)[1].get('[role="switch"]');
    expect(sw.attributes('aria-checked')).toBe('false');
    await sw.trigger('click');
    await flushPromises();

    expect(mocked.patchReceiptReview).toHaveBeenCalledTimes(1);
    expect(mocked.patchReceiptReview).toHaveBeenCalledWith(SHA_UNMATCHED, { to_process: true });
    expect(bodyRows(w)[1].get('[role="switch"]').attributes('aria-checked')).toBe('true');
    // The modal must NOT have opened (click.stop on the inline control).
    expect(dialogEl()).toBeNull();
    expect(mocked.getReceipt).not.toHaveBeenCalled();
    w.unmount();
  });

  it('when the PATCH rejects, the optimistic toggle REVERTS and an error alert is raised', async () => {
    let rejectPatch!: (e: Error) => void;
    mocked.patchReceiptReview.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectPatch = reject; }),
    );

    const w = mountPage();
    await flushPromises();

    const sw = bodyRows(w)[1].get('[role="switch"]');
    await sw.trigger('click');
    await nextTick();
    // Optimistic: ON while the request is in flight.
    expect(bodyRows(w)[1].get('[role="switch"]').attributes('aria-checked')).toBe('true');

    rejectPatch(new Error('403'));
    await flushPromises();

    // Reverted.
    expect(bodyRows(w)[1].get('[role="switch"]').attributes('aria-checked')).toBe('false');
    expect(w.text()).toContain('Saving the review failed — change reverted.');
    w.unmount();
  });

  it('toggling OFF an already-flagged row PATCHes { to_process: false }', async () => {
    const w = mountPage();
    await flushPromises();
    const sw = bodyRows(w)[5].get('[role="switch"]');
    expect(sw.attributes('aria-checked')).toBe('true');
    await sw.trigger('click');
    await flushPromises();
    expect(mocked.patchReceiptReview).toHaveBeenCalledWith(SHA_SKIPPED, { to_process: false });
    expect(bodyRows(w)[5].get('[role="switch"]').attributes('aria-checked')).toBe('false');
    w.unmount();
  });

  // The decision CONTROL is gone from the UI (2026-08-20), but `review.decision`
  // is still DATA the API returns and the revert path must not corrupt it.
  it('revert on failure also restores the previous stored decision/note data for a row whose review was non-default', async () => {
    mocked.patchReceiptReview.mockRejectedValue(new Error('500'));
    const w = mountPage();
    await flushPromises();
    await bodyRows(w)[5].get('[role="switch"]').trigger('click');
    await flushPromises();
    // to_process back to true, decision untouched.
    const r = (w.vm as any).rows.find((x: any) => x.sha256 === SHA_SKIPPED);
    expect(r.review.to_process).toBe(true);
    expect(r.review.decision).toBe('MEAL_SKIP');
    expect(r.review.note).toBe('lunch');
    w.unmount();
  });
});

// ── URL persistence from the mounted page ───────────────────────────────────

describe('AuditReceipts — URL persistence', () => {
  it('hydrates filters from route.query on mount and sends them to the API', async () => {
    routeQuery.fy = 'FY26';
    routeQuery.decision = 'NONE';
    routeQuery.page = '3';
    const w = mountPage();
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenCalledWith({ fy: 'FY26', decision: 'NONE', page: 3, page_size: 50 });
    expect(routerReplace).toHaveBeenCalledWith({ query: { fy: 'FY26', decision: 'NONE', page: '3' } });
    w.unmount();
  });

  it('changing a filter while on page 3 resets to page 1, refetches with the filter and syncs the URL', async () => {
    routeQuery.page = '3';
    mocked.getReceipts.mockResolvedValue(listResponse(ROWS, { num_pages: 5 }));
    const w = mountPage();
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 3, page_size: 50 });

    (w.vm as any).filters.decision = 'NONE';
    await flushPromises();

    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ decision: 'NONE', page: 1, page_size: 50 });
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { decision: 'NONE' } });
    expect(w.text()).toContain('Filtered');
    w.unmount();
  });

  it('a URL page beyond the server num_pages is clamped (page=3, num_pages=1 → refetch page 1 and URL loses ?page)', async () => {
    routeQuery.page = '3';
    const w = mountPage();
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenNthCalledWith(1, { page: 3, page_size: 50 });
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 1, page_size: 50 });
    expect(routerReplace).toHaveBeenLastCalledWith({ query: {} });
    w.unmount();
  });

  it('Clear filters restores defaults and refetches the unfiltered register', async () => {
    routeQuery.fy = 'FY26';
    routeQuery.q = 'makro';
    const w = mountPage();
    await flushPromises();
    const clear = w.findAll('button').find((b) => b.text() === 'Clear')!;
    expect(clear.attributes('disabled')).toBeUndefined();
    await clear.trigger('click');
    await flushPromises();
    expect(mocked.getReceipts).toHaveBeenLastCalledWith({ page: 1, page_size: 50 });
    expect(routerReplace).toHaveBeenLastCalledWith({ query: {} });
    w.unmount();
  });

  it('a clean mount replaces the route with an empty query', async () => {
    const w = mountPage();
    await flushPromises();
    expect(routerReplace).toHaveBeenCalledWith({ query: {} });
    w.unmount();
  });
});
