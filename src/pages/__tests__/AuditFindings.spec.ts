// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditFindings.spec.ts — ADVERSARIAL mount-based spec for
 * src/pages/AuditFindings.vue (the Audit → Findings console page).
 *
 * Written against the Deploy-1 snapshot surface (frozen contract +
 * RULING REVERSAL: detail GET returns the ENVELOPE {finding, comments,
 * attachments}). This suite doubles as the regression gate for the
 * in-flight page extension — if a test here goes red after the extension
 * lands, that is a finding, not a reason to weaken the test.
 *
 * Strategy (house pattern, AuditReceipts.*.spec.ts): mount the REAL page —
 * AppPage / PageHeader / FilterBar / KTable / KDialog / KMenu / summary strip
 * all real — mock only src/api/findings and vue-router. Fixtures use the
 * data shapes the page ACTUALLY sees in production per the frozen contract:
 * `amount` is a 2dp STRING or null (never a number), `due_date` is
 * 'YYYY-MM-DD' or null, CharFields serialise as '' (ruling R7), evidence is
 * a list of {type, ref, note} objects with hostile variants mixed in.
 *
 * What is verified:
 *   1. table renders realistic rows (string amounts, null amount, '' fields,
 *      mixed evidence, comma+ampersand title) — null amount renders BLANK,
 *      never 'null'/'NaN'/'R0.00'
 *   2. XSS-shaped titles/descriptions render as TEXT, never as HTML
 *   3. summary strip agrees with the table; a drifted by_severity payload
 *      (buckets ≠ count) must not crash the page
 *   4. filters ⇄ URL sync round-trips hostile values (space, %, &, non-ASCII)
 *      exactly; a pre-populated query restores filter state; junk degrades
 *   5. FY selector first-load behaviour: current-FY-empty preselects the most
 *      recent FY WITH findings; a URL-pinned FY is never overridden
 *   6. detail modal: envelope handling, evidence hostile cases ([], null,
 *      missing keys, unknown type, javascript: url), comments, attachments,
 *      detail-fetch failure keeps the row data + raises an alert
 *   7. bulk bar: select/deselect, ids POSTed as numbers, the 500 cap
 *   8. error / empty / loading states (401 reads as an auth problem)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../api/findings', () => ({
  // Keep in sync with the real module's server-side bulk cap.
  BULK_MAX: 500,
  listFindings: vi.fn(),
  getFinding: vi.fn(),
  createFinding: vi.fn(),
  updateFinding: vi.fn(),
  addFindingComment: vi.fn(),
  bulkUpdateFindings: vi.fn(),
  findingsSummary: vi.fn(),
  exportFindingsUrl: vi.fn(),
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

import * as api from '../../api/findings';
import AuditFindings from '../AuditFindings.vue';
import KMenuItem from '../../components/klikk/KMenuItem.vue';
import KTable from '../../components/klikk/KTable.vue';
import { currentFy, fyLabel } from '../../utils/fy';

const mocked = api as unknown as {
  listFindings: ReturnType<typeof vi.fn>;
  getFinding: ReturnType<typeof vi.fn>;
  createFinding: ReturnType<typeof vi.fn>;
  updateFinding: ReturnType<typeof vi.fn>;
  addFindingComment: ReturnType<typeof vi.fn>;
  bulkUpdateFindings: ReturnType<typeof vi.fn>;
  findingsSummary: ReturnType<typeof vi.fn>;
  exportFindingsUrl: ReturnType<typeof vi.fn>;
};

/** The page's module-level DEFAULT_FY — String(currentFy()) at import time. */
const CUR = String(currentFy());

// ── Fixtures — production-shaped findings (frozen contract + ruling R7) ─────

const XSS_TITLE = '<img src=x onerror=alert(1)>';
const XSS_DESC = '<script>alert(2)</script> & <b>bold?</b>';

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    fy: 2026,
    ref: 'FY26-001',
    title: 'Payments made before supplier bill captured',
    severity: 'HIGH',
    status: 'OPEN',
    category: 'SUP',
    amount: '429110.39', // STRING per contract, never a number
    currency: 'ZAR',
    description: 'Criteria: bills before payment. Condition: R429,110.39 paid first. Effect: AP misstated.',
    evidence: [],
    owner: 'bookkeeper',
    due_date: null,
    source: 'internal-audit run 13',
    check_code: '', // R7: CharFields serialise as '', never null
    asana_gid: '1217633700114593',
    created_by: 'mcp',
    updated_by: '',
    created_at: '2026-08-20T09:00:00Z',
    updated_at: '2026-08-20T09:05:00Z',
    comment_count: 0,
    attachment_count: 0,
    ...overrides,
  };
}

/** Mixed-shape evidence — the hostile-but-contract-legal production set. */
const MIXED_EVIDENCE = [
  { type: 'journal', ref: 'JRN-1042', note: 'Bill captured 11 days after payment' },
  { type: 'url', ref: 'https://go.xero.com/Bank/ViewTransaction.aspx?id=abc', note: '' },
  { type: 'note', ref: '', note: 'OCR total ties to the bank line' },
  { type: 'note' }, // missing ref AND note keys entirely
  { type: 'cube-view', ref: 'CV-99', note: 'unknown type leaked by a future writer' },
];

function baseRows() {
  return [
    finding({
      id: 1,
      ref: 'FY26-001',
      evidence: MIXED_EVIDENCE,
      comment_count: 2,
      attachment_count: 1,
    }),
    // amount null + every optional CharField '' — the FY26-002 SARS shape.
    finding({
      id: 2,
      ref: 'FY26-002',
      title: 'SARS banking-details verification — Lia Dippenaar (related party)',
      severity: 'HIGH',
      category: 'PRC',
      amount: null,
      owner: 'MC',
      asana_gid: '',
      check_code: '',
      description: '',
      evidence: [],
    }),
    // Real ZAR amount with a comma AND an ampersand in the title; resolved row.
    finding({
      id: 3,
      ref: 'FY26-003',
      title: 'Aurras R138,000 paid with no invoice (R64,400 personal & R73,600 company)',
      severity: 'HIGH',
      status: 'RESOLVED',
      amount: '138000.00',
      owner: 'MC',
      due_date: '2026-09-15',
    }),
    // XSS-shaped title/description — must render as TEXT.
    finding({
      id: 4,
      ref: 'FY26-004',
      title: XSS_TITLE,
      description: XSS_DESC,
      severity: 'MEDIUM',
      category: 'BNK',
      check_code: 'BNK-05',
      amount: '458498.00',
    }),
    // Defensive: a non-numeric amount leak + '' owner/category/source.
    finding({
      id: 5,
      ref: 'FY26-005',
      title: 'Low finding with hostile amount leak',
      severity: 'LOW',
      category: '',
      amount: 'R 1 234,56',
      owner: '',
      source: '',
    }),
  ];
}

function listResponse(
  results: Array<Record<string, unknown>> = baseRows(),
  {
    count = results.length,
    page = 1,
    page_size = 50,
    num_pages = 1,
    fy = 2026,
    amount = '1025608.39',
  }: Record<string, number | string> = {},
) {
  return {
    count,
    page,
    page_size,
    num_pages,
    fy,
    current_fy: Number(CUR),
    totals: { count, amount },
    results,
  };
}

function summaryResponse(overrides: Record<string, unknown> = {}) {
  return {
    fy: 2026,
    current_fy: Number(CUR),
    fy_options: [Number(CUR), 2026],
    count: 5,
    amount: '1025608.39',
    open_count: 4,
    by_severity: [
      { key: 'HIGH', count: 3, amount: '567110.39' },
      { key: 'MEDIUM', count: 1, amount: '458498.00' },
      { key: 'LOW', count: 1, amount: '0.00' },
    ],
    by_status: [
      { key: 'OPEN', count: 4, amount: '887608.39' },
      { key: 'RESOLVED', count: 1, amount: '138000.00' },
    ],
    by_category: [
      { key: 'SUP', count: 2, amount: '567110.39' },
      { key: 'BNK', count: 1, amount: '458498.00' },
      { key: 'PRC', count: 1, amount: '0.00' },
    ],
    by_owner: [
      { key: 'bookkeeper', count: 1, amount: '429110.39' },
      { key: 'MC', count: 2, amount: '138000.00' },
    ],
    ...overrides,
  };
}

/** Detail envelope — the API shape per the RULING REVERSAL (R1 withdrawn). */
function detailEnvelope(id: number, extra: Record<string, unknown> = {}) {
  const row = baseRows().find((r) => r.id === id) ?? finding({ id });
  return {
    finding: { ...row },
    comments:
      id === 1
        ? [
            { id: 11, finding_id: 1, text: 'Bookkeeper notified — awaiting the missing bills.', author: 'mcp', created_at: '2026-08-20T10:00:00Z' },
            { id: 12, finding_id: 1, text: 'Second pass scheduled.', author: '', created_at: '2026-08-20T10:30:00Z' },
          ]
        : [],
    attachments:
      id === 1
        ? [
            {
              id: 21,
              finding_id: 1,
              original_name: 'bank-statement.pdf',
              content_type: 'application/pdf',
              size: 245760,
              uploaded_by: 'mc',
              created_at: '2026-08-20T10:05:00Z',
              view_url: 'http://127.0.0.1:8001/audit/findings/attachment/21/file/?s=abc123',
            },
          ]
        : [],
    ...extra,
  };
}

// ── Harness ─────────────────────────────────────────────────────────────────

let warnings: string[];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

type VM = {
  filters: Record<string, unknown> & { status: string[]; severity: string[]; category: string[]; owner: string; q: string; fy: string };
  statusMenuOpen: boolean;
};

function mountPage() {
  return mount(AuditFindings, {
    attachTo: document.body,
    global: {
      config: {
        warnHandler: (msg: string) => { warnings.push(msg); },
      },
    },
  });
}

/** KDialog teleports to <body> — query it from document. */
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
  return w.find('.af-bulk-bar');
}

/** Header-relative cell lookup (KTable's selectable column shifts indexes). */
function headerIndex(w: ReturnType<typeof mount>, label: string): number {
  const idx = w.findAll('thead th').findIndex((th) => th.text().trim() === label);
  if (idx === -1) throw new Error(`No <th> labelled "${label}" — did a column get renamed?`);
  return idx;
}

function cellFor(w: ReturnType<typeof mount>, rowWrapper: ReturnType<typeof bodyRows>[number], label: string) {
  const cells = rowWrapper.findAll('td');
  const idx = headerIndex(w, label);
  if (idx >= cells.length) throw new Error(`Row has ${cells.length} tds but "${label}" resolves to index ${idx}`);
  return cells[idx];
}

/** Collapse NBSP/thin-space so en-ZA currency output can be asserted sanely. */
function norm(text: string) {
  return text.replace(/[\u00a0\u202f]/g, ' ');
}

function lastReplaceQuery(): Record<string, unknown> {
  const call = routerReplace.mock.calls.at(-1);
  if (!call) throw new Error('router.replace was never called');
  return (call[0] as { query: Record<string, unknown> }).query;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  warnings = [];
  routerReplace.mockReset();
  for (const k of Object.keys(routeQuery)) delete routeQuery[k];
  // Most tests pin FY2026 via the URL — deterministic single list+summary
  // fetch, no first-load FY probe. FY-selector tests delete this.
  routeQuery.fy = '2026';
  mocked.listFindings.mockReset().mockResolvedValue(listResponse());
  mocked.findingsSummary.mockReset().mockResolvedValue(summaryResponse());
  mocked.getFinding.mockReset().mockImplementation(async (id: number) => detailEnvelope(Number(id)));
  mocked.createFinding.mockReset();
  mocked.updateFinding.mockReset();
  mocked.addFindingComment.mockReset().mockImplementation(async (id: number, text: string) => ({
    id: 99, finding_id: Number(id), text, author: 'mc', created_at: '2026-08-20T12:00:00Z',
  }));
  mocked.bulkUpdateFindings.mockReset().mockResolvedValue({ updated: 0, commented: 0, unknown: [] });
  mocked.exportFindingsUrl.mockReset().mockResolvedValue(undefined);
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  document.body.innerHTML = '';
});

// ── 1. Table rendering with realistic rows ──────────────────────────────────

describe('AuditFindings — renders production-shaped rows', () => {
  it('fetches on mount with the pinned FY + default paging and renders one <tr> per result, no Vue warnings', async () => {
    const w = mountPage();
    await flushPromises();

    expect(mocked.listFindings).toHaveBeenCalledTimes(1);
    expect(mocked.listFindings).toHaveBeenCalledWith({ fy: '2026', page: 1, page_size: 50 });

    expect(bodyRows(w).length).toBe(5);
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('shows ref / severity / status / owner for a row', async () => {
    const w = mountPage();
    await flushPromises();
    const r0 = bodyRows(w)[0];

    expect(cellFor(w, r0, 'Ref').text()).toBe('FY26-001');
    expect(cellFor(w, r0, 'Severity').text()).toContain('High');
    expect(cellFor(w, r0, 'Status').text()).toContain('Open');
    expect(cellFor(w, r0, 'Owner').text()).toBe('bookkeeper');
    expect(cellFor(w, r0, 'Category').text()).toBe('SUP');
    expect(cellFor(w, r0, 'Comments').text()).toBe('2');
    w.unmount();
  });

  it('formats the string amount "429110.39" for display without precision loss', async () => {
    const w = mountPage();
    await flushPromises();
    const cell = norm(cellFor(w, bodyRows(w)[0], 'Amount').text());
    // en-ZA currency — digits must all survive: 429 110 . 39
    expect(cell).toMatch(/R\s?429\s?110[.,]39/);
    w.unmount();
  });

  it('renders a NULL amount as BLANK — not "null", not "NaN", not "R0.00"', async () => {
    const w = mountPage();
    await flushPromises();
    const cell = cellFor(w, bodyRows(w)[1], 'Amount'); // FY26-002, amount: null
    const text = cell.text();
    expect(text).toBe('');
    expect(text).not.toContain('null');
    expect(text).not.toContain('NaN');
    expect(norm(text)).not.toMatch(/R\s?0/);
    w.unmount();
  });

  it("renders a non-numeric amount leak ('R 1 234,56') defensively, never 'NaN'", async () => {
    const w = mountPage();
    await flushPromises();
    const text = cellFor(w, bodyRows(w)[4], 'Amount').text();
    expect(text).not.toContain('NaN');
    expect(text).toBe('—'); // formatMoney's defensive dash
    w.unmount();
  });

  it("renders '—' for null due_date and for '' category / owner (R7 empty-string CharFields)", async () => {
    const w = mountPage();
    await flushPromises();
    const r1 = bodyRows(w)[1]; // due_date null
    expect(cellFor(w, r1, 'Due').text()).toBe('—');
    const r4 = bodyRows(w)[4]; // category '', owner '', source ''
    expect(cellFor(w, r4, 'Category').text()).toBe('—');
    expect(cellFor(w, r4, 'Owner').text()).toBe('—');
    expect(cellFor(w, r4, 'Source').text()).toBe('—');
    // and the populated due date shows verbatim
    expect(cellFor(w, bodyRows(w)[2], 'Due').text()).toBe('2026-09-15');
    w.unmount();
  });

  it('renders a title containing a real ZAR amount with comma and ampersand literally', async () => {
    const w = mountPage();
    await flushPromises();
    expect(cellFor(w, bodyRows(w)[2], 'Title').text())
      .toBe('Aurras R138,000 paid with no invoice (R64,400 personal & R73,600 company)');
    w.unmount();
  });

  it('renders an XSS-shaped title as TEXT — no <img> element is ever created', async () => {
    const w = mountPage();
    await flushPromises();
    // The payload as text…
    expect(cellFor(w, bodyRows(w)[3], 'Title').text()).toBe(XSS_TITLE);
    // …and never as markup, anywhere in the document.
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('tbody script')).toBeNull();
    w.unmount();
  });

  it('shows the count label and the filter-wide Total badge', async () => {
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('Showing 1–5 of 5 findings');
    expect(norm(w.text())).toMatch(/Total R\s?1\s?025\s?608[.,]39/);
    w.unmount();
  });
});

// ── 3. Summary strip agrees with the table ──────────────────────────────────

describe('AuditFindings — summary strip', () => {
  it('strip tiles and pills agree with the table for the same filter', async () => {
    const w = mountPage();
    await flushPromises();

    // Strip and table describe the same population.
    expect(bodyRows(w).length).toBe(5);
    const tiles = w.findAll('.metric-tile');
    const findingsTile = tiles.find((t) => t.text().includes('Findings'));
    const openTile = tiles.find((t) => t.text().includes('Open'));
    expect(findingsTile?.text()).toContain('5');
    expect(openTile?.text()).toContain('4');
    expect(norm(w.text())).toMatch(/R\s?1\s?025\s?608[.,]39/);

    // Severity pills carry the counts.
    const stripText = w.find('.af-summary').text();
    expect(stripText).toContain('High 3');
    expect(stripText).toContain('Medium 1');
    expect(stripText).toContain('Low 1');
    expect(stripText).toContain('Open 4');
    expect(stripText).toContain('Resolved 1');

    // Both endpoints were called with the SAME filter params.
    expect(mocked.findingsSummary).toHaveBeenCalledWith({ fy: '2026' });
    expect(mocked.listFindings).toHaveBeenCalledWith({ fy: '2026', page: 1, page_size: 50 });
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('a drifted summary (by_severity buckets do NOT sum to count) still renders without crashing', async () => {
    mocked.findingsSummary.mockResolvedValue(summaryResponse({
      count: 5,
      by_severity: [
        { key: 'HIGH', count: 40, amount: '1.00' }, // 40+58+1 ≠ 5 — backend drift
        { key: 'MEDIUM', count: 58, amount: '2.00' },
        { key: 'INFO', count: 1, amount: null },     // hostile: null bucket amount
      ],
    }));

    const w = mountPage();
    await flushPromises();

    // Page stays up: table renders, strip renders the server's own numbers.
    expect(bodyRows(w).length).toBe(5);
    expect(w.find('.af-summary').text()).toContain('High 40');
    expect(w.find('.af-summary').text()).toContain('Info 1');
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── 4. Filters + URL sync ───────────────────────────────────────────────────

describe('AuditFindings — filters ⇄ URL ⇄ API', () => {
  it('changing status/severity refetches table AND summary with the same params, resets to page 1, and syncs the URL', async () => {
    const w = mountPage();
    await flushPromises();
    const vm = w.vm as unknown as VM;

    vm.filters.status = ['OPEN', 'IN_PROGRESS'];
    await flushPromises();

    expect(mocked.listFindings).toHaveBeenLastCalledWith({
      fy: '2026', status: 'OPEN,IN_PROGRESS', page: 1, page_size: 50,
    });
    expect(mocked.findingsSummary).toHaveBeenLastCalledWith({
      fy: '2026', status: 'OPEN,IN_PROGRESS',
    });
    expect(lastReplaceQuery()).toEqual({ fy: '2026', status: 'OPEN,IN_PROGRESS' });

    vm.filters.severity = ['HIGH'];
    await flushPromises();
    expect(mocked.listFindings).toHaveBeenLastCalledWith({
      fy: '2026', status: 'OPEN,IN_PROGRESS', severity: 'HIGH', page: 1, page_size: 50,
    });
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('a q value with space, %, & and non-ASCII round-trips through the URL exactly', async () => {
    const HOSTILE = '50% naïve & "spaced" — R1,5m';
    const w = mountPage();
    await flushPromises();
    (w.vm as unknown as VM).filters.q = HOSTILE;
    await flushPromises();

    // Out: the exact raw string lands in the route query (vue-router encodes).
    expect(lastReplaceQuery().q).toBe(HOSTILE);
    expect(mocked.listFindings).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: HOSTILE }),
    );
    w.unmount();
    document.body.innerHTML = '';

    // In: a fresh mount hydrating that query restores the exact string.
    routeQuery.q = HOSTILE;
    mocked.listFindings.mockClear();
    const w2 = mountPage();
    await flushPromises();
    expect(mocked.listFindings).toHaveBeenCalledWith(
      expect.objectContaining({ q: HOSTILE, fy: '2026' }),
    );
    const search = w2.findAll('input').find((i) => (i.element as HTMLInputElement).value === HOSTILE);
    expect(search).toBeTruthy();
    w2.unmount();
  });

  it('a fully-populated query string restores every filter, paging and ordering', async () => {
    Object.assign(routeQuery, {
      fy: '2026',
      status: 'open,resolved', // lowercase in the URL — must normalise
      severity: 'high',
      category: 'sup',
      owner: 'book',
      q: 'R429',
      page: '2',
      page_size: '100',
      ordering: '-amount',
    });
    mocked.listFindings.mockResolvedValue(listResponse(baseRows(), { count: 250, num_pages: 3, page: 2, page_size: 100 }));

    const w = mountPage();
    await flushPromises();

    expect(mocked.listFindings).toHaveBeenCalledWith({
      fy: '2026',
      status: 'OPEN,RESOLVED',
      severity: 'HIGH',
      category: 'SUP',
      owner: 'book',
      q: 'R429',
      ordering: '-amount',
      page: 2,
      page_size: 100,
    });
    expect(w.text()).toContain('Filtered');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('junk query values degrade to sane defaults — no NaN/undefined ever reaches the API', async () => {
    Object.assign(routeQuery, {
      fy: '1999',        // below the 2015 floor → default FY
      status: 'bogus',   // unknown vocab → dropped
      severity: 'ultra', // unknown vocab → dropped
      page: '-3',
      page_size: '999',
      ordering: '-not_a_column',
    });

    const w = mountPage();
    await flushPromises();

    // fy fell back to the page default (current FY) — junk never forwarded.
    const call = mocked.listFindings.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call).toEqual({ fy: CUR, page: 1, page_size: 50 });
    for (const [k, v] of Object.entries(call)) {
      expect(v, `param ${k}`).not.toBeUndefined();
      if (typeof v === 'number') expect(Number.isNaN(v)).toBe(false);
      if (typeof v === 'string') expect(v).not.toMatch(/^(NaN|undefined|null)$/);
    }
    w.unmount();
  });

  it('a KTable sort emit sends ?ordering and resets to page 1', async () => {
    const w = mountPage();
    await flushPromises();

    w.findComponent(KTable).vm.$emit('update:sortBy', [{ id: 'amount', desc: true }]);
    await flushPromises();

    expect(mocked.listFindings).toHaveBeenLastCalledWith({
      fy: '2026', ordering: '-amount', page: 1, page_size: 50,
    });
    expect(lastReplaceQuery().ordering).toBe('-amount');
    w.unmount();
  });

  it('Clear resets the filters but keeps the FY', async () => {
    Object.assign(routeQuery, { owner: 'book', q: 'R429' });
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('Filtered');

    const clearBtn = w.findAll('button').find((b) => b.text() === 'Clear');
    expect(clearBtn).toBeTruthy();
    await clearBtn!.trigger('click');
    await flushPromises();

    expect(mocked.listFindings).toHaveBeenLastCalledWith({ fy: '2026', page: 1, page_size: 50 });
    expect(lastReplaceQuery()).toEqual({ fy: '2026' });
    w.unmount();
  });
});

// ── 5. FY selector ──────────────────────────────────────────────────────────

describe('AuditFindings — FY selection', () => {
  it('first load with NO fy in the URL and an EMPTY current FY preselects the most recent FY that has findings', async () => {
    delete routeQuery.fy;
    mocked.findingsSummary.mockImplementation(async (params: Record<string, unknown>) => {
      if (String(params?.fy) === CUR) {
        return summaryResponse({
          fy: Number(CUR), count: 0, open_count: 0, amount: '0.00',
          by_severity: [], by_status: [], by_category: [], by_owner: [],
          fy_options: [Number(CUR), 2026],
        });
      }
      return summaryResponse();
    });
    mocked.listFindings.mockImplementation(async (params: Record<string, unknown>) =>
      String(params?.fy) === '2026' ? listResponse() : listResponse([], { count: 0, amount: '0.00' }));

    const w = mountPage();
    await flushPromises();

    // The probe went to the current FY first…
    expect(mocked.findingsSummary.mock.calls[0][0]).toEqual({ fy: CUR });
    // …then the page flipped to FY2026 (the most recent year WITH findings).
    expect(mocked.listFindings).toHaveBeenLastCalledWith({ fy: '2026', page: 1, page_size: 50 });
    expect(bodyRows(w).length).toBe(5);
    expect(w.text()).toContain(fyLabel(2026)); // subtitle names the resolved FY
    expect(lastReplaceQuery().fy).toBe('2026'); // and the URL records it
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('first load with NO fy in the URL and a NON-empty current FY stays on the current FY', async () => {
    delete routeQuery.fy;
    mocked.findingsSummary.mockResolvedValue(summaryResponse({ fy: Number(CUR), count: 3 }));

    const w = mountPage();
    await flushPromises();

    expect(mocked.listFindings).toHaveBeenLastCalledWith({ fy: CUR, page: 1, page_size: 50 });
    expect(w.text()).toContain(fyLabel(Number(CUR)));
    w.unmount();
  });

  it('a URL-pinned FY is NEVER overridden by the first-load preselect, even when empty', async () => {
    routeQuery.fy = CUR;
    mocked.findingsSummary.mockResolvedValue(summaryResponse({
      fy: Number(CUR), count: 0, open_count: 0, amount: '0.00',
      by_severity: [], by_status: [], by_category: [], by_owner: [],
      fy_options: [Number(CUR), 2026],
    }));
    mocked.listFindings.mockResolvedValue(listResponse([], { count: 0, amount: '0.00', fy: Number(CUR) }));

    const w = mountPage();
    await flushPromises();

    // Exactly ONE summary call (no probe) and the list stayed on the pinned FY.
    expect(mocked.findingsSummary).toHaveBeenCalledTimes(1);
    expect(mocked.listFindings).toHaveBeenCalledWith({ fy: CUR, page: 1, page_size: 50 });
    expect(w.text()).toContain(`No findings recorded for FY${CUR}`);
    w.unmount();
  });

  it("fy=all spans every year and the subtitle says so", async () => {
    routeQuery.fy = 'all';
    const w = mountPage();
    await flushPromises();

    expect(mocked.listFindings).toHaveBeenCalledWith({ fy: 'all', page: 1, page_size: 50 });
    expect(w.text()).toContain('all financial years');
    w.unmount();
  });
});

// ── 6. Detail modal ─────────────────────────────────────────────────────────

describe('AuditFindings — detail modal', () => {
  it('opens on row click, fetches the envelope, and shows description / evidence / comments / attachments', async () => {
    const w = mountPage();
    await flushPromises();
    expect(dialogEl()).toBeNull();

    await bodyRows(w)[0].trigger('click');
    await flushPromises();

    expect(mocked.getFinding).toHaveBeenCalledWith(1);
    const dlg = dialogEl();
    expect(dlg).not.toBeNull();
    const text = dlg!.textContent ?? '';

    expect(text).toContain('FY26-001');
    expect(text).toContain('Criteria: bills before payment.');

    // Evidence: all five hostile-but-legal items render.
    const evidenceRows = dlg!.querySelectorAll('.af-evidence__row');
    expect(evidenceRows.length).toBe(5);
    expect(text).toContain('JRN-1042');
    expect(text).toContain('Bill captured 11 days after payment');
    // url-type evidence renders as a real link.
    const link = dlg!.querySelector<HTMLAnchorElement>('a.af-evidence__ref');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://go.xero.com/Bank/ViewTransaction.aspx?id=abc');
    // Missing note/ref keys must not leak the string "undefined".
    expect(text).not.toContain('undefined');
    // Unknown evidence type renders its badge, not a blank modal.
    expect(text).toContain('cube-view');

    // Comments: both render; blank author reads as Unknown.
    expect(text).toContain('Bookkeeper notified — awaiting the missing bills.');
    expect(text).toContain('Second pass scheduled.');
    expect(text).toContain('Unknown');

    // Attachments moved behind a tab when the modal grew to four sections
    // (Detail / Cube view / Linked evidence / Attachments). RATIFIED by senior-dev:
    // a flat four-section modal was unusable. The invariant is unchanged and this
    // asserts it MORE strictly than the old inline check -- the attachment must be
    // REACHABLE, i.e. the tab exists, it activates, and the file is then shown.
    const attachTab = Array.from(dlg.querySelectorAll('button, [role="tab"]'))
      .find((el) => /attachment/i.test(el.textContent || ''));
    expect(attachTab, 'no Attachments tab in the finding modal').toBeTruthy();
    (attachTab as HTMLElement).click();
    await flushPromises();
    const attachText = dlg.textContent || '';
    expect(attachText).toContain('bank-statement.pdf');
    expect(attachText).toContain('240.0 KB');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('evidence [] and evidence null must neither blank the modal nor throw', async () => {
    mocked.getFinding.mockImplementation(async (id: number) =>
      detailEnvelope(Number(id), { finding: { ...finding({ id: 2, ref: 'FY26-002', amount: null }), evidence: null } }));
    const w = mountPage();
    await flushPromises();

    // evidence: null via the envelope
    await bodyRows(w)[1].trigger('click');
    await flushPromises();
    let dlg = dialogEl();
    expect(dlg).not.toBeNull();
    expect(dlg!.textContent).toContain('No evidence recorded.');
    dlg!.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();
    await flushPromises();
    expect(dialogEl()).toBeNull();

    // evidence: [] via the envelope
    mocked.getFinding.mockImplementation(async (id: number) =>
      detailEnvelope(Number(id), { finding: { ...finding({ id: 3, ref: 'FY26-003' }), evidence: [] } }));
    await bodyRows(w)[2].trigger('click');
    await flushPromises();
    dlg = dialogEl();
    expect(dlg).not.toBeNull();
    expect(dlg!.textContent).toContain('No evidence recorded.');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('an XSS-shaped description renders as TEXT inside the modal', async () => {
    const w = mountPage();
    await flushPromises();
    await bodyRows(w)[3].trigger('click'); // FY26-004, XSS title + description
    await flushPromises();

    const dlg = dialogEl()!;
    expect(dlg.textContent).toContain(XSS_DESC); // the literal payload as text
    expect(dlg.querySelector('script')).toBeNull();
    expect(dlg.querySelector('img[src="x"]')).toBeNull();
    w.unmount();
  });

  it('a url-type evidence ref with a javascript: scheme must NOT be emitted as a clickable javascript: href', async () => {
    mocked.getFinding.mockImplementation(async () => detailEnvelope(1, {
      finding: {
        ...finding({ id: 1 }),
        evidence: [{ type: 'url', ref: 'javascript:alert(document.cookie)', note: 'hostile ref' }],
      },
    }));
    const w = mountPage();
    await flushPromises();
    await bodyRows(w)[0].trigger('click');
    await flushPromises();

    const dlg = dialogEl()!;
    const link = dlg.querySelector<HTMLAnchorElement>('a.af-evidence__ref');
    // The item may render as a link or as text — but if it IS a link, the
    // href must not carry an executable scheme. A finding's evidence.ref is
    // user/agent-supplied content.
    if (link) {
      const href = (link.getAttribute('href') || '').trim().toLowerCase();
      expect(href.startsWith('javascript:')).toBe(false);
    }
    w.unmount();
  });

  it('when the detail GET fails, the modal keeps the list-row data and an action alert is raised', async () => {
    mocked.getFinding.mockRejectedValue({ response: { status: 500, data: { detail: 'kaboom' } } });
    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[0].trigger('click');
    await flushPromises();

    const dlg = dialogEl();
    expect(dlg).not.toBeNull();
    expect(dlg!.textContent).toContain('FY26-001'); // list-row data still shown
    expect(w.text()).toContain('Could not load the full finding detail');
    w.unmount();
  });

  it('posting a comment appends it to the thread', async () => {
    const w = mountPage();
    await flushPromises();
    await bodyRows(w)[0].trigger('click');
    await flushPromises();

    const dlg = dialogEl()!;
    const ta = dlg.querySelector<HTMLTextAreaElement>('textarea.af-textarea');
    expect(ta).not.toBeNull();
    setNativeValue(ta!, 'Chased the supplier again.');
    await nextTick();

    const submit = Array.from(dlg.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.trim() === 'Add comment');
    expect(submit).toBeTruthy();
    submit!.click();
    await flushPromises();

    expect(mocked.addFindingComment).toHaveBeenCalledWith(1, 'Chased the supplier again.');
    expect(dialogEl()!.textContent).toContain('Chased the supplier again.');
    w.unmount();
  });
});

// ── 7. Bulk bar ─────────────────────────────────────────────────────────────

describe('AuditFindings — bulk bar', () => {
  it('appears on selection with the right count, and Clear selection hides it', async () => {
    const w = mountPage();
    await flushPromises();
    expect(bulkBar(w).exists()).toBe(false);

    await rowCheckboxes(w)[0].setValue(true);
    await nextTick();
    expect(bulkBar(w).exists()).toBe(true);
    expect(bulkBar(w).text()).toContain('1 selected');

    await headerCheckbox(w).setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('5 selected');

    const clearBtn = bulkBar(w).findAll('button').find((b) => b.text() === 'Clear selection');
    await clearBtn!.trigger('click');
    await nextTick();
    expect(bulkBar(w).exists()).toBe(false);
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('Set status posts NUMERIC ids for the selected rows and refreshes table + summary', async () => {
    const w = mountPage();
    await flushPromises();
    mocked.bulkUpdateFindings.mockResolvedValue({ updated: 2, commented: 0, unknown: [] });

    await rowCheckboxes(w)[0].setValue(true);
    await rowCheckboxes(w)[2].setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('2 selected');

    const listCallsBefore = mocked.listFindings.mock.calls.length;
    (w.vm as unknown as VM).statusMenuOpen = true;
    await nextTick();
    await flushPromises();
    const items = w.findAllComponents(KMenuItem);
    expect(items.length).toBeGreaterThan(0);
    const resolved = items.find((i) => i.text() === 'Resolved');
    expect(resolved).toBeTruthy();
    resolved!.vm.$emit('select');
    await flushPromises();

    expect(mocked.bulkUpdateFindings).toHaveBeenCalledTimes(1);
    const body = mocked.bulkUpdateFindings.mock.calls[0][0] as { ids: unknown[]; status: string };
    expect(body.status).toBe('RESOLVED');
    expect([...body.ids].sort()).toEqual([1, 3]);
    for (const id of body.ids) expect(typeof id).toBe('number');

    // refreshAll() after the bulk: the table refetched.
    expect(mocked.listFindings.mock.calls.length).toBeGreaterThan(listCallsBefore);
    w.unmount();
  });

  it('Set owner dialog posts { ids, owner } and closes on success', async () => {
    const w = mountPage();
    await flushPromises();
    mocked.bulkUpdateFindings.mockResolvedValue({ updated: 1, commented: 0, unknown: [] });

    await rowCheckboxes(w)[1].setValue(true);
    await nextTick();
    const ownerBtn = bulkBar(w).findAll('button').find((b) => b.text().startsWith('Set owner'));
    await ownerBtn!.trigger('click');
    await flushPromises();

    const dlg = dialogEl();
    expect(dlg).not.toBeNull();
    const input = dlg!.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    setNativeValue(input!, 'bookkeeper');
    await nextTick();

    const submit = Array.from(dlg!.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.trim() === 'Set owner');
    submit!.click();
    await flushPromises();

    expect(mocked.bulkUpdateFindings).toHaveBeenCalledWith({ ids: [2], owner: 'bookkeeper' });
    expect(dialogEl()).toBeNull(); // closed on success
    w.unmount();
  });

  it('a selection over the 500 cap shows the cap message, disables the actions, and never POSTs', async () => {
    const MANY = Array.from({ length: 501 }, (_, i) => finding({
      id: i + 1,
      ref: `FY26-${String(i + 1).padStart(3, '0')}`,
      title: `Finding ${i + 1}`,
      amount: i % 5 === 0 ? null : '10.00',
      evidence: [],
    }));
    mocked.listFindings.mockResolvedValue(listResponse(MANY, { count: 501, amount: '4000.00' }));

    const w = mountPage();
    await flushPromises();
    expect(bodyRows(w).length).toBe(501);

    await headerCheckbox(w).setValue(true);
    await nextTick();
    expect(bulkBar(w).text()).toContain('501 selected');
    expect(bulkBar(w).text()).toContain('Bulk actions are limited to 500 findings per action');

    // The action triggers are disabled…
    const setStatus = bulkBar(w).findAll('button').find((b) => b.text().startsWith('Set status'));
    expect(setStatus!.attributes('disabled')).toBeDefined();
    const setOwner = bulkBar(w).findAll('button').find((b) => b.text().startsWith('Set owner'));
    expect(setOwner!.attributes('disabled')).toBeDefined();

    // …and even a forced menu activation is refused by the runBulk guard.
    (w.vm as unknown as VM).statusMenuOpen = true;
    await nextTick();
    await flushPromises();
    const item = w.findAllComponents(KMenuItem).find((i) => i.text() === 'Resolved');
    if (item) {
      item.vm.$emit('select');
      await flushPromises();
    }
    expect(mocked.bulkUpdateFindings).not.toHaveBeenCalled();

    // Deselecting clears the bar.
    await headerCheckbox(w).setValue(false);
    await nextTick();
    expect(bulkBar(w).exists()).toBe(false);
    w.unmount();
  }, 30000);
});

// ── 8. Error / empty / loading states ───────────────────────────────────────

describe('AuditFindings — error, empty and loading states', () => {
  it('a 401 renders a real auth message, not a mysteriously empty table', async () => {
    mocked.listFindings.mockRejectedValue({ response: { status: 401 } });
    mocked.findingsSummary.mockRejectedValue({ response: { status: 401 } });

    const w = mountPage();
    await flushPromises();

    expect(w.text()).toContain('Not authenticated — your session has expired. Sign in again to load findings.');
    // The PAGE-LEVEL empty states must NOT appear — they would read as a
    // truthful empty register when it is actually an auth failure. (KTable's
    // own generic "No data" default slot still renders inside the table body —
    // that is shared-component behaviour, identical on AuditReceipts, and out
    // of scope here; noted in the report as cosmetic.)
    expect(w.text()).not.toContain('No findings recorded');
    expect(w.text()).not.toContain('No findings match');
    w.unmount();
  });

  it("a 500 with a detail body renders the fallback message plus the server's detail", async () => {
    mocked.listFindings.mockRejectedValue({ response: { status: 500, data: { detail: 'boom' } } });
    const w = mountPage();
    await flushPromises();

    expect(w.text()).toContain('Could not load the findings register.');
    expect(w.text()).toContain('boom');
    w.unmount();
  });

  it('an empty unfiltered result renders the FY empty state; an empty FILTERED result renders "No findings match"', async () => {
    mocked.listFindings.mockResolvedValue(listResponse([], { count: 0, amount: '0.00' }));
    mocked.findingsSummary.mockResolvedValue(summaryResponse({ count: 0, open_count: 0, amount: '0.00', by_severity: [], by_status: [] }));

    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('No findings recorded for FY2026');
    w.unmount();
    document.body.innerHTML = '';

    routeQuery.owner = 'nobody';
    const w2 = mountPage();
    await flushPromises();
    expect(w2.text()).toContain('No findings match');
    // …with a working clear-filters CTA.
    const cta = w2.findAll('button').find((b) => b.text() === 'Clear filters');
    expect(cta).toBeTruthy();
    w2.unmount();
  });

  it('shows the loading state while the list is in flight, then the rows', async () => {
    let resolveList!: (v: unknown) => void;
    mocked.listFindings.mockImplementation(() => new Promise((res) => { resolveList = res; }));

    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('Loading findings…');
    expect(w.find('.kdl-empty-state').exists()).toBe(false);

    resolveList(listResponse());
    await flushPromises();
    expect(bodyRows(w).length).toBe(5);
    expect(w.text()).toContain('Showing 1–5 of 5 findings');
    w.unmount();
  });

  it('Export CSV calls the export helper with the current filter params and NO paging keys', async () => {
    const w = mountPage();
    await flushPromises();

    const btn = w.findAll('button').find((b) => b.text() === 'Export CSV');
    await btn!.trigger('click');
    await flushPromises();

    expect(mocked.exportFindingsUrl).toHaveBeenCalledTimes(1);
    const [params, format] = mocked.exportFindingsUrl.mock.calls[0];
    expect(format).toBe('csv');
    expect(params).toEqual({ fy: '2026' });
    expect(params).not.toHaveProperty('page');
    expect(params).not.toHaveProperty('page_size');
    w.unmount();
  });
});

// ── 9. Row quick actions ────────────────────────────────────────────────────

describe('AuditFindings — row quick actions', () => {
  it('every row renders the action cell; OPEN shows Mark resolved, RESOLVED shows Reopen', async () => {
    const w = mountPage();
    await flushPromises();

    const rows = bodyRows(w);
    expect(rows[0].find('.af-actions').exists()).toBe(true);
    // Row 0 = FY26-001 (OPEN)
    expect(rows[0].find('button[title="Mark resolved"]').exists()).toBe(true);
    expect(rows[0].find('button[title="Reopen"]').exists()).toBe(false);
    // Row 2 = FY26-003 (RESOLVED)
    expect(rows[2].find('button[title="Reopen"]').exists()).toBe(true);
    expect(rows[2].find('button[title="Mark resolved"]').exists()).toBe(false);
    w.unmount();
  });

  it('Mark resolved PATCHes { status: RESOLVED }, refetches, and does NOT open the detail dialog', async () => {
    mocked.updateFinding.mockResolvedValue({ ...baseRows()[0], status: 'RESOLVED' });
    const w = mountPage();
    await flushPromises();
    mocked.listFindings.mockClear();
    mocked.findingsSummary.mockClear();

    await bodyRows(w)[0].get('button[title="Mark resolved"]').trigger('click');
    await flushPromises();

    expect(mocked.updateFinding).toHaveBeenCalledWith(1, { status: 'RESOLVED' });
    // The action cell stops propagation — the row-click detail open must not fire.
    expect(mocked.getFinding).not.toHaveBeenCalled();
    expect(dialogEl()).toBeNull();
    // Status changes move summary buckets → both endpoints resync.
    expect(mocked.listFindings).toHaveBeenCalled();
    expect(mocked.findingsSummary).toHaveBeenCalled();
    w.unmount();
  });

  it('a failed quick action raises the action-error alert and leaves the row intact', async () => {
    mocked.updateFinding.mockRejectedValue({ response: { status: 500, data: {} } });
    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[0].get('button[title="Mark resolved"]').trigger('click');
    await flushPromises();

    expect(w.text()).toContain('Updating the finding status failed');
    expect(cellFor(w, bodyRows(w)[0], 'Status').text()).toContain('Open');
    w.unmount();
  });

  it('Discuss opens the detail dialog on that finding', async () => {
    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[0].get('button[title="Discuss — add a comment"]').trigger('click');
    await flushPromises();

    expect(mocked.getFinding).toHaveBeenCalledWith(1);
    expect(dialogEl()).not.toBeNull();
    w.unmount();
  });
});

// ── 10. Resizable columns ───────────────────────────────────────────────────

describe('AuditFindings — resizable columns', () => {
  const WIDTHS_KEY = 'klikk.audit-findings.col-widths';

  afterEach(() => {
    localStorage.removeItem(WIDTHS_KEY);
  });

  it('enables KTable resizing and renders drag handles in the header', async () => {
    const w = mountPage();
    await flushPromises();

    expect(w.getComponent(KTable).props('resizable')).toBe(true);
    expect(w.findAll('.ktable-th__resizer').length).toBeGreaterThan(0);
    w.unmount();
  });

  it('restores persisted widths on mount and writes new widths back to localStorage', async () => {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify({ ref: 222 }));
    const w = mountPage();
    await flushPromises();

    const widths = w.findAll('colgroup col').map((c) => (c.element as HTMLElement).style.width);
    expect(widths).toContain('222px');

    w.getComponent(KTable).vm.$emit('update:columnSizing', { ref: 300 });
    await nextTick();
    expect(JSON.parse(localStorage.getItem(WIDTHS_KEY)!)).toEqual({ ref: 300 });
    w.unmount();
  });

  it('junk in the persisted widths key degrades to defaults instead of crashing', async () => {
    localStorage.setItem(WIDTHS_KEY, '{not json');
    const w = mountPage();
    await flushPromises();

    expect(bodyRows(w).length).toBeGreaterThan(0);
    w.unmount();
  });
});

// ── 11. Auditor mode (read-only role) ───────────────────────────────────────

describe('AuditFindings — auditor mode', () => {
  beforeEach(() => {
    mockAuth.isAuditor = true;
    mockAuth.user = { role: 'auditor' };
  });

  afterEach(() => {
    mockAuth.isAuditor = false;
    mockAuth.user = { role: 'standard' };
  });

  it('renders no selection checkboxes, no quick-action column, and no bulk bar', async () => {
    const w = mountPage();
    await flushPromises();

    expect(rowCheckboxes(w).length).toBe(0);
    expect(w.find('thead input.ktable-checkbox').exists()).toBe(false);
    expect(w.find('.af-actions').exists()).toBe(false);
    expect(w.find('.af-bulk-bar').exists()).toBe(false);
    // Read surface intact: rows and export buttons still render.
    expect(bodyRows(w).length).toBeGreaterThan(0);
    expect(w.findAll('button').some((b) => b.text() === 'Export CSV')).toBe(true);
    w.unmount();
  });

  it('detail dialog shows no Update section and no comment form, but comments stay readable', async () => {
    const w = mountPage();
    await flushPromises();

    await bodyRows(w)[0].trigger('click');
    await flushPromises();

    const dialog = dialogEl();
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).not.toContain('Save changes');
    expect(dialog!.querySelector('.af-comment-form')).toBeNull();
    // Comments from the envelope still render read-only.
    expect(dialog!.textContent).toContain('Bookkeeper notified');
    w.unmount();
  });
});
