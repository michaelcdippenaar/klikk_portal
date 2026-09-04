// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditComments.registerScale.spec — the WHOLE register, not one card.
 *
 * filterContext.spec proves each card renders correctly. It used the real
 * 12-years-and-144-months anchor on ONE row, and it passed — while the page
 * shipped and hung in production. The defect was never in a single card: it
 * was in the aggregate.
 *
 * The list response is ~1.4 MB for 113 comments, nearly all of it enumerated
 * `dimf`. That payload predates the chip rendering; the old page survived it
 * by treating the blob as one opaque string. The chip rendering parsed it
 * FOUR times per row per render — hasFilters, shownChips, and chipOverflow
 * twice — so drawing the page cost 452 parses, and so did every re-render:
 * every keystroke in the search box and every 5-second feed poll re-parsed
 * megabytes of JSON.
 *
 * So this spec asserts COST, not just correctness, at the real register's
 * shape and size. The invariants that matter:
 *   - an anchor is parsed at most once per row per load
 *   - re-rendering parses NOTHING
 *   - sitting idle parses nothing (no render loop)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

/**
 * Vitest's 5-second default is a harness default, not a budget.
 *
 * Every test in this file MOUNTS the whole register — 113 cards over a 1.4 MB
 * payload — which is the entire point of the file, and it takes a second or so
 * on its own. Run alongside the other 79 spec files the runner schedules in
 * parallel, that drifted past five seconds often enough to make the suite
 * flaky, and a flaky guard is a guard people learn to ignore.
 *
 * Raising the wall-clock ceiling does NOT weaken anything here: what this file
 * asserts is CALL COUNTS (`parseCalls`, `seatReads`), which are invariant to
 * machine load in a way timings are not — see the note at the top. The
 * budget is still "at most once per row, and nothing on re-render".
 */
// Timeout is set GLOBALLY in vitest.config.js (60s), not here. A per-file
// vi.setConfig leaks to whatever else shares the worker: this file setting
// 30s was dragging the global ceiling DOWN for AuditFindings.spec.ts, which
// has no override of its own and was failing at 30s while the config said 60.

// Counts real parses by wrapping the one function every anchor read goes
// through. A spy here is the honest measure — timings vary with machine load,
// call counts do not.
const parseCalls = vi.hoisted(() => ({ n: 0 }));

// The same measure, for the OTHER piece of per-row work this page does: every
// row that carries an `assignee_role` has to be resolved to a person's name.
// `seatReads` counts real property reads on the directory, through a Proxy —
// a name resolved in the template would be read once per row PER RENDER, which
// is precisely the shape that took this page down last time.
const seatReads = vi.hoisted(() => ({ n: 0 }));

vi.mock('../../api/cubeComments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/cubeComments')>();
  return {
    ...actual,
    normaliseFilters: (f: unknown) => { parseCalls.n += 1; return actual.normaliseFilters(f); },
    getComments: vi.fn(),
    getAuditCubeComments: vi.fn(),
    getCubeCommentReplies: vi.fn().mockResolvedValue({ results: [] }),
    postCubeCommentReply: vi.fn(),
    setCubeCommentStatus: vi.fn(),
    setCommentDecision: vi.fn(),
    setCommentAssignee: vi.fn(),
    drillCubeComment: vi.fn(),
  };
});
// The page decorates every row with the seat directory and fills the
// "Assigned to" filter from it. Mocked at the network boundary like every
// other fetch in this spec; the fixture is the live directory as at
// 2026-09-03, INCLUDING the inactive seat — a directory with only active
// people in it could not catch the console offering an inactive one.
vi.mock('../../api/people', () => {
  const people = [
    { id: 1, handle: 'auditor', display_name: 'George du Preez', email: 'george@moore.co.za', active: true },
    { id: 2, handle: 'bookkeeper', display_name: 'Anzelle Vermaak', email: 'anzelle@moore.co.za', active: true },
    { id: 3, handle: 'jordyn', display_name: 'Jordyn Wolhuter', email: 'jordyn@klikk.co.za', active: false },
    { id: 4, handle: 'mc', display_name: 'MC Dippenaar', email: 'mc@tremly.com', active: true },
  ].map((p) => new Proxy(p, {
    get(target, prop, recv) {
      if (prop === 'display_name' || prop === 'active') seatReads.n += 1;
      return Reflect.get(target, prop, recv);
    },
  }));
  return { getPeople: vi.fn().mockResolvedValue({ count: people.length, results: people }) };
});
vi.mock('../../api/comments', () => ({
  getCommentFeed: vi.fn().mockResolvedValue({ now: null, events: [] }),
}));
vi.mock('../../composables/useToast', () => ({
  useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../stores/auth', () => ({
  useAuthStore: () => ({ isAuditor: false, user: { username: 'mc', role: 'standard' } }),
}));

import * as api from '../../api/cubeComments';
import AuditComments from '../AuditComments.vue';

const mocked = api as unknown as {
  getAuditCubeComments: ReturnType<typeof vi.fn>;
  setCommentAssignee: ReturnType<typeof vi.fn>;
  drillCubeComment: ReturnType<typeof vi.fn>;
  getCubeCommentReplies: ReturnType<typeof vi.fn>;
};

// ~10 KB of anchor per comment, matching production's 1.4 MB across 113 rows.
const YEARS = Array.from({ length: 12 }, (_, i) => String(2015 + i));
const MONTHS = YEARS.flatMap((y) =>
  Array.from({ length: 12 }, (_, m) => `${y}-${String(m + 1).padStart(2, '0')}`));
const ACCOUNTS = Array.from({ length: 180 }, (_, i) => `${4000 + i} — Account name number ${i}`);
const DIMF = JSON.stringify({
  year: YEARS, month: MONTHS, account: ACCOUNTS,
  entity: ['Klikk (Pty) Ltd', 'Tremly', 'Dippenaar Family Trust'],
});

const REGISTER_SIZE = 113;

function register() {
  return Array.from({ length: REGISTER_SIZE }, (_, i) => ({
    id: i + 1, subject_type: 'cube_cell', subject_label: `cell ${i}`,
    comment: `note ${i}`, author: 'MC (To Review)', author_key: 'MC (To Review)',
    status: 'open', decision: '', tags: [], updated_at: '2026-09-03T10:00:00Z',
    row_dims: ['account'], row_path: ['6100 Repairs'], col_dims: ['month'],
    col_path: '2026-08', measure: 'amount', cell_value: '21600.00', reply_count: 0,
    filters: JSON.stringify({ tenant: 'Klikk', journal_type: 'ACCREC', dimf: DIMF }),
    // All three assignment states, spread across the whole register rather
    // than sampled on row 1: unassigned, with a live seat, and with a seat
    // that has since been stood down. A fixture where every row is the same
    // could not tell "resolved once" from "resolved once per distinct value".
    assignee_role: ASSIGNMENTS[i % 3],
  }));
}

const ASSIGNMENTS = ['', 'bookkeeper', 'jordyn'];
/** How many of the 113 carry a seat at all — the ceiling on honest lookups. */
const ASSIGNED_ROWS = Array.from({ length: REGISTER_SIZE }, (_, i) => ASSIGNMENTS[i % 3])
  .filter(Boolean).length;

let w: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  parseCalls.n = 0;
  seatReads.n = 0;
  mocked.getAuditCubeComments.mockResolvedValue({ results: register() });
  mocked.setCommentAssignee.mockImplementation(async (id: number, handle: string) => ({
    id, assignee_role: handle, reassigned: true,
  }));
});
afterEach(() => { w?.unmount(); w = null; document.body.innerHTML = ''; });

async function mountPage() {
  w = mount(AuditComments, { attachTo: document.body });
  await flushPromises();
  return w;
}

describe('AuditComments — the whole register at production scale', () => {
  it('is a realistic fixture', () => {
    const bytes = JSON.stringify({ results: register() }).length;
    // Guard the guard: if this fixture ever shrinks, the spec stops testing
    // the thing it exists for.
    expect(bytes).toBeGreaterThan(1_000_000);
    expect(Math.round(bytes / REGISTER_SIZE / 1024)).toBeGreaterThanOrEqual(9);
  });

  it('renders all 113 cards', async () => {
    const page = await mountPage();
    expect(page.findAll('article.cc')).toHaveLength(REGISTER_SIZE);
  });

  it('parses each row\'s anchor at most ONCE to draw the page', async () => {
    await mountPage();
    // Was 452 — four reads per row, each re-parsing ~10 KB.
    expect(parseCalls.n).toBeLessThanOrEqual(REGISTER_SIZE);
  });

  it('parses NOTHING on re-render — a keystroke must not re-read the register', async () => {
    const page = await mountPage();
    parseCalls.n = 0;
    (page.vm as unknown as { filters: { q: string } }).filters.q = 'note';
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(page.findAll('article.cc').length).toBeGreaterThan(0);
    // Was 452 again, on every single keystroke and every 5s feed poll.
    expect(parseCalls.n).toBe(0);
  });

  it('parses nothing while idle — no render loop', async () => {
    await mountPage();
    parseCalls.n = 0;
    await new Promise((r) => setTimeout(r, 800));
    expect(parseCalls.n).toBe(0);
  });

  it('parses nothing when a card is expanded — either rung of the disclosure', async () => {
    const page = await mountPage();
    parseCalls.n = 0;
    // Rung one: the filter run opens.
    await page.find('.cc__context-toggle').trigger('click');
    await flushPromises();
    expect(parseCalls.n).toBe(0);
    // Rung two: every value in it.
    await page.find('.cc__filter--more').trigger('click');
    await flushPromises();
    expect(parseCalls.n).toBe(0);
  });

  it('rests as ONE summary line per card — the register is 113 lines, not 113 runs', async () => {
    const page = await mountPage();
    // The resting card renders NO chips at all. This is the assertion that
    // makes the collapse real rather than a CSS promise: 113 open runs is the
    // clutter MC named, and hiding them with display:none would still build
    // every node.
    expect(page.findAll('.cc__filter')).toHaveLength(0);
    const lines = page.findAll('.cc__context-toggle').map((b) => b.text());
    expect(lines).toHaveLength(REGISTER_SIZE);
    lines.forEach((t) => {
      expect(t).toBe('Under filters: tenant, journal_type, year +3 more fields');
      expect(t).not.toContain('{"year"');
    });
  });

  it('still folds correctly at scale — every card, not just the first', async () => {
    const page = await mountPage();
    const cards = page.findAll('article.cc');
    // Open every one of the 113 runs: folding that only works on card one is
    // the aggregate defect this file exists for, in a new place.
    //
    // Clicked synchronously and flushed ONCE, not awaited per card: 113
    // awaited triggers is 113 full re-renders of a 1.4 MB register, which
    // took this file past a minute and destabilised whatever shared its
    // worker. Vue batches them into one render, which is also what a real
    // burst of clicks would do.
    cards.forEach((c) => { (c.find('.cc__context-toggle').element as HTMLElement).click(); });
    await flushPromises();
    const texts = cards.map((c) => c.find('.cc__filters').text());
    expect(texts).toHaveLength(REGISTER_SIZE);
    texts.forEach((t) => {
      expect(t).not.toContain('{"year"');
      expect(t).toContain('tenant: Klikk');
      expect(t).toContain('more values');
    });
  });

  it('expanding one card at scale leaves the other 112 folded', async () => {
    const page = await mountPage();
    const cards = page.findAll('article.cc');
    await cards[0].find('.cc__context-toggle').trigger('click');
    await cards[0].find('.cc__filter--more').trigger('click');
    expect(cards[0].find('.cc__filters').text()).toContain('2026-12');
    const others = cards.slice(1).filter((c) => c.find('.cc__filters').exists());
    expect(others).toHaveLength(0);
  });

  /**
   * The CDO restyle added three things a template could have been tempted to
   * compute per row: the anchor headline, the figure beside it, and the
   * "Under filters: …" summary line. All three are read off the SAME `anchors`
   * / row properties the page already had — a `primaryAnchor(row)` or a
   * `filterSummary(row)` called from the template would re-run on every render
   * and every 5-second feed poll, which is the exact shape of the defect that
   * took this page down.
   */
  it('renders the new headline, figure and summary line without re-reading anything', async () => {
    const page = await mountPage();

    // What the reader SEES. A badge on this page once rendered EMPTY in
    // production while 75 mount specs passed, because none asserted the text.
    const subjects = page.findAll('.cc__subject').map((n) => n.text());
    expect(subjects).toHaveLength(REGISTER_SIZE);
    expect(subjects[0]).toBe('cell 0');
    const amounts = page.findAll('.cc__amount').map((n) => n.text());
    expect(amounts).toHaveLength(REGISTER_SIZE);
    amounts.forEach((a) => expect(a).toContain('21,600.00'));
    amounts.forEach((a) => expect(a.startsWith('R')).toBe(true));
    // The comment itself is on the card, full text, once per row.
    const texts = page.findAll('[data-test^="cc-text-"]').map((n) => n.text());
    expect(texts).toHaveLength(REGISTER_SIZE);
    expect(texts[0]).toBe('note 0');

    // And drawing all of that cost nothing beyond the one parse per row.
    expect(parseCalls.n).toBeLessThanOrEqual(REGISTER_SIZE);

    // A keystroke re-renders every card, headline and summary line included.
    parseCalls.n = 0;
    seatReads.n = 0;
    (page.vm as unknown as { filters: { q: string } }).filters.q = 'note';
    await flushPromises();
    expect(page.findAll('.cc__subject').length).toBeGreaterThan(0);
    expect(page.findAll('.cc__context-toggle')[0].text())
      .toBe('Under filters: tenant, journal_type, year +3 more fields');
    expect(parseCalls.n).toBe(0);
    expect(seatReads.n).toBe(0);
  });

  /**
   * The edit affordance, at register scale.
   *
   * It is ONE editor for the whole page, not per-row state: 113 rows each
   * holding a draft, a saving flag and an error string is per-row allocation
   * on a page that has already been taken down by exactly that.
   */
  it('offers the edit affordance on every row and holds state for none of them', async () => {
    const page = await mountPage();
    const editors = page.findAll('[data-test^="cc-edit-"]')
      .filter((b) => /cc-edit-\d+$/.test(b.attributes('data-test') || ''));
    expect(editors).toHaveLength(REGISTER_SIZE);
    expect(editors[0].text()).toBe('Edit text');
    // Nothing is in edit mode, and no history has been fetched.
    expect(page.findAll('[data-test^="cc-editor-"]')).toHaveLength(0);
    expect(page.findAll('[data-test^="cc-history-panel-"]')).toHaveLength(0);
    const vm = page.vm as unknown as { history: Record<string, unknown> };
    expect(Object.keys(vm.history)).toHaveLength(0);

    // Opening ONE editor re-renders the register and re-reads nothing.
    parseCalls.n = 0;
    seatReads.n = 0;
    await editors[7].trigger('click');
    await flushPromises();
    expect(page.findAll('[data-test^="cc-editor-"]')).toHaveLength(1);
    expect(parseCalls.n).toBe(0);
    expect(seatReads.n).toBe(0);
  });
});


/**
 * The assignment decoration, at the same scale and under the same rule.
 *
 * Showing "who is this with" is per-row work read from the template, which is
 * exactly the shape of the defect this file exists for: the anchor chips were
 * correct on every card and still took the page down, because the cost was in
 * the aggregate and in the RE-render. Correctness tests would pass on a
 * template that called `labelFor(row.assignee_role)` inline and rebuilt a Map
 * 113 times per keystroke, so the guard has to measure, not just look.
 */
describe('AuditComments — assignment at register scale', () => {
  /**
   * TWO tests, two mounts, several invariants each — deliberately.
   *
   * Every mount here paints 113 cards over a 1.4 MB payload, so an `it` per
   * assertion would triple this file's wall-clock for nothing: the invariants
   * below are read off ONE rendered page, and splitting them would only mean
   * rendering the same page again to ask it another question.
   */

  it('names every assigned seat, offers only the live ones, and resolves each row once', async () => {
    const page = await mountPage();

    // ── what it says ──
    // Every row carries a picker whose value IS the stored handle, and every
    // assigned row shows the PERSON behind it.
    const held = page.findAll('[data-test^="cc-assign-"]')
      .map((p) => (p.element as HTMLSelectElement).value);
    expect(held).toHaveLength(REGISTER_SIZE);
    expect(held.filter(Boolean)).toHaveLength(ASSIGNED_ROWS);
    const labelled = page.findAll('[data-test^="cc-assign-"]').map((p) => {
      const v = (p.element as HTMLSelectElement).value;
      return p.findAll('option').find((o) => o.attributes('value') === v)!.text();
    });
    expect(labelled.filter((t) => t === 'Anzelle Vermaak').length).toBeGreaterThan(0);
    // A stood-down seat says so in words, not by colour alone.
    expect(labelled.filter((t) => t.includes('Jordyn Wolhuter'))
      .every((t) => t.includes('no longer active'))).toBe(true);

    // ── what it offers ──
    const options = (page.vm as unknown as {
      assigneeOptions: Array<{ label: string; value: string }>;
    }).assigneeOptions;
    expect(options.map((o) => o.value)).not.toContain('jordyn');
    expect(options.map((o) => o.label).join(' ')).not.toContain('Jordyn');
    // The pickers offer active seats only, on every one of the 113 rows —
    // sampling row 1 is what let the last aggregate defect through.
    const pickers = page.findAll('[data-test^="cc-assign-"]');
    expect(pickers).toHaveLength(REGISTER_SIZE);
    const offered = new Set(pickers.flatMap(
      (p) => p.findAll('option').map((o) => o.attributes('value'))));
    // 'jordyn' appears ONLY as the disabled current value on the rows that
    // already hold it — never as a target on a row that does not.
    const onUnheld = page.findAll('[data-test^="cc-assign-"]').filter(
      (p) => (p.element as HTMLSelectElement).value !== 'jordyn');
    expect(onUnheld.every((p) => !p.findAll('option')
      .some((o) => o.attributes('value') === 'jordyn'))).toBe(true);
    expect(offered.has('bookkeeper')).toBe(true);

    // ── what the pickers ALLOCATE ──
    // Every row whose seat the picker already offers must share ONE options
    // array by reference. 113 rows each holding their own copy of the same
    // four options is per-row allocation on the render path — the exact shape
    // of the defect this file exists for. Only the stood-down rows differ,
    // because they carry an extra disabled option naming the seat they hold.
    const entries = [...(page.vm as unknown as {
      assignments: Map<number, { options: unknown }>;
    }).assignments.values()];
    expect(entries).toHaveLength(REGISTER_SIZE);
    const distinctArrays = new Set(entries.map((e) => e.options));
    // EXACTLY two: the shared base list, and the one variant carrying the
    // stood-down seat as a disabled option. Not 113, and not one per stale
    // ROW either — the 37 rows holding 'jordyn' share a single array, because
    // resolution is memoised per handle rather than per row.
    expect(distinctArrays.size).toBe(2);
    // The whole entry is shared too, not just its options.
    expect(new Set(entries).size).toBe(3); // unassigned, bookkeeper, jordyn

    // ── what it cost ──
    // Bounded by DISTINCT SEATS, not by rows. There are four seats and a
    // hundred and thirteen rows, and resolution is memoised per handle, so
    // drawing the whole register reads the directory a couple of dozen times
    // — not two hundred, and not two hundred again on the next render.
    //
    // This number is the one that matters. When the resolution was inlined
    // per row it was ~166 here and 21,321 across a bulk run: O(n²) in the size
    // of the register, the same shape as the anchor defect this file exists
    // for, reintroduced by the assignment feature and caught here.
    expect(seatReads.n).toBeLessThanOrEqual(32);
    // Guard the guard: a fixture with no assignments would pass everything
    // above while measuring nothing.
    expect(ASSIGNED_ROWS).toBeGreaterThan(60);
  });

  it('resolves nothing again — not on a keystroke, an expand, a triage, or idle', async () => {
    const page = await mountPage();
    const vm = page.vm as unknown as {
      filters: { q: string };
      all: Array<{ status: string }>;
    };

    // A keystroke in the search box.
    parseCalls.n = 0;
    seatReads.n = 0;
    vm.filters.q = 'note';
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(page.findAll('article.cc').length).toBeGreaterThan(0);
    expect(seatReads.n).toBe(0);

    // Expanding one card's anchor — both rungs of the disclosure.
    await page.find('.cc__context-toggle').trigger('click');
    await flushPromises();
    await page.find('.cc__filter--more').trigger('click');
    await flushPromises();
    expect(seatReads.n).toBe(0);

    // Triage: `status` is mutated in place, and neither `filters` nor
    // `assignee_role` changes, so neither derived map may recompute.
    vm.all[0].status = 'actioned';
    vm.all[50].status = 'dismissed';
    await flushPromises();
    expect(parseCalls.n).toBe(0);
    expect(seatReads.n).toBe(0);

    // And sitting still.
    await new Promise((r) => setTimeout(r, 400));
    expect(parseCalls.n).toBe(0);
    expect(seatReads.n).toBe(0);
  });

  it('selecting and bulk-assigning the whole register re-reads nothing per render', async () => {
    const page = await mountPage();
    const vm = page.vm as unknown as {
      selectedCount: number;
      bulkHandle: string;
      toggleSelectAll: () => void;
      assignSelected: () => Promise<void>;
    };

    // Ticking all 113 boxes is a render of every row. Selection membership is
    // a Set lookup, not a list scan, and it touches neither the anchors nor
    // the directory — if either of those is read here, the bulk bar has put
    // the register's size back on the render path.
    parseCalls.n = 0;
    seatReads.n = 0;
    vm.toggleSelectAll();
    await flushPromises();
    expect(vm.selectedCount).toBe(REGISTER_SIZE);
    expect(parseCalls.n).toBe(0);
    expect(seatReads.n).toBe(0);

    // The run itself: one call per comment, and the anchors are never touched.
    //
    // 113 rows change, so the register's assignment map is invalidated 113
    // times — and this is the assertion that made the design what it is. With
    // resolution inlined, each invalidation re-resolved all 113 rows: 21,321
    // directory reads for one bulk assign. Memoising per HANDLE instead of per
    // row makes the run cost a handful, because the register holds four seats
    // however many comments point at them.
    vm.bulkHandle = 'auditor';
    await vm.assignSelected();
    await flushPromises();
    expect(mocked.setCommentAssignee).toHaveBeenCalledTimes(REGISTER_SIZE);
    expect(parseCalls.n).toBe(0);
    expect(seatReads.n).toBeLessThanOrEqual(32);

    // And having settled, it is quiet again.
    seatReads.n = 0;
    await new Promise((r) => setTimeout(r, 400));
    expect(seatReads.n).toBe(0);
  });
});


/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE TRANSACTIONS ON THE RESTING CARD, AT REGISTER SCALE.
 *
 * MC replaced the coordinate chip run with the actual ledger lines: "Just put
 * the actual transaction widget there. It is obviously imprtant to see which
 * transaction the comment refer to."
 *
 * Each of those lines is a DRILL — a query against
 * /xero/data/journals/pivot/drill/ — and this register is 113 rows. Fetching
 * one per row on load is the exact per-row cost that took this page down, in
 * a more expensive currency than the JSON parses above: those were CPU, these
 * are round trips. So the invariants here are about WHEN a drill happens:
 *
 *   - mounting the whole register fetches NOTHING on its own
 *   - only the cards a viewport actually reports fetch, and never more than a
 *     handful are in flight at once
 *   - a keystroke, a filter change and opening an editor fetch nothing
 *   - a card that has already loaded never asks again
 *
 * And, separately, about what the reader SEES — asserted as rendered TEXT,
 * because a badge on this page shipped EMPTY while seventy-five mount specs
 * passed on `.exists()`.
 * ───────────────────────────────────────────────────────────────────────── */

type IOEntry = { isIntersecting: boolean; target: Element };

/**
 * The page's viewport gate, under test control.
 *
 * happy-dom ships an IntersectionObserver whose `observe` is a documented
 * no-op, so the real one would let every assertion below pass by never firing.
 * This one records what was observed and lets a test say which cards the
 * reader has scrolled to.
 */
class FakeIO {
  static instances: FakeIO[] = [];
  targets = new Set<Element>();
  constructor(public cb: (entries: IOEntry[]) => void, public options: unknown) {
    FakeIO.instances.push(this);
  }
  observe(el: Element) { this.targets.add(el); }
  unobserve(el: Element) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); }
  takeRecords(): IOEntry[] { return []; }
}

/** In-flight accounting for the drill mock, so concurrency can be measured. */
const drill = { inFlight: 0, peak: 0, pending: [] as Array<() => void> };

/** What one cell resolves to. Row 1 reconciles, row 2 is empty, the rest do not. */
function drillFor(row: { id: number }) {
  const n = row.id === 1 ? 5 : row.id === 2 ? 0 : 2;
  const rows = Array.from({ length: n }, (_, k) => ({
    id: `${row.id}-${k}`,
    date: `2025-12-0${k + 1}`,
    journal_number: 9000 + k,
    journal_type: 'ACCPAY',
    account_code: 'HH--TR02',
    account_name: 'Transport Expense',
    supplier_name: 'Titan Trailers (Atlantic Trailers)',
    description: `Trailer respray leg ${k + 1}`,
    amount: '4320.00',
  }));
  return { rows, count: n, line_total: (4320 * n).toFixed(2), truncated: false };
}

function armDrill() {
  drill.inFlight = 0;
  drill.peak = 0;
  drill.pending = [];
  mocked.drillCubeComment.mockImplementation((row: { id: number }) => {
    drill.inFlight += 1;
    drill.peak = Math.max(drill.peak, drill.inFlight);
    return new Promise((resolve) => {
      drill.pending.push(() => { drill.inFlight -= 1; resolve(drillFor(row)); });
    });
  });
}

/** Let every outstanding drill answer — including the ones the queue starts next. */
async function settleDrills() {
  for (let guard = 0; drill.pending.length && guard < 50; guard += 1) {
    drill.pending.splice(0).forEach((done) => done());
    await flushPromises();
  }
  await flushPromises();
}

/** "The reader scrolled these cards into view." */
async function reveal(page: ReturnType<typeof mount>, ids: number[]) {
  const io = FakeIO.instances[0];
  const entries: IOEntry[] = [];
  ids.forEach((id) => {
    const el = page.find(`article.cc[data-comment-id="${id}"]`).element;
    entries.push({ isIntersecting: true, target: el });
  });
  io.cb(entries);
  await flushPromises();
}

function cardText(page: ReturnType<typeof mount>, id: number) {
  return page.find(`article.cc[data-comment-id="${id}"]`).text().replace(/\s+/g, ' ');
}

describe('AuditComments — the transactions on the resting card', () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    armDrill();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('mounts 113 cards and fetches NOT ONE drill until something is on screen', async () => {
    const page = await mountPage();
    expect(page.findAll('article.cc')).toHaveLength(REGISTER_SIZE);
    // The whole point. 113 drills on load is the regression this guards.
    expect(mocked.drillCubeComment).not.toHaveBeenCalled();
    // ONE observer for the register, not one per row — and every card is
    // watched, so scrolling anywhere still works.
    expect(FakeIO.instances).toHaveLength(1);
    expect(FakeIO.instances[0].targets.size).toBe(REGISTER_SIZE);
  });

  it('fetches ONLY the cards the viewport reports, a few at a time', async () => {
    const page = await mountPage();
    const onScreen = [1, 2, 3, 4, 5, 6, 7, 8];
    await reveal(page, onScreen);

    // Bounded by the viewport, and nowhere near the register.
    expect(mocked.drillCubeComment.mock.calls.length).toBeLessThanOrEqual(onScreen.length);
    expect(mocked.drillCubeComment.mock.calls.length).toBeLessThan(REGISTER_SIZE / 4);
    // Never a stampede: a browser reporting a whole screenful at once turns
    // into a queue, not eight concurrent queries.
    expect(drill.peak).toBeLessThanOrEqual(4);

    await settleDrills();
    expect(mocked.drillCubeComment).toHaveBeenCalledTimes(onScreen.length);
    const asked = mocked.drillCubeComment.mock.calls.map((c) => (c[0] as { id: number }).id);
    expect([...asked].sort((a, b) => a - b)).toEqual(onScreen);
    // And the 105 nobody looked at were never asked for.
    expect(asked.some((id) => id > 8)).toBe(false);
  });

  it('shows the lines themselves — date, account, supplier, description, amount', async () => {
    const page = await mountPage();
    await reveal(page, [1]);
    await settleDrills();

    const text = cardText(page, 1);
    // The reconciliation lead, in words.
    expect(text).toContain('5 lines, 21,600.00 — matches the commented value.');
    // The transaction itself. Every field MC named, as rendered text.
    expect(text).toContain('2025-12-01');
    expect(text).toContain('HH--TR02 Transport Expense');
    expect(text).toContain('Titan Trailers (Atlantic Trailers)');
    expect(text).toContain('Trailer respray leg 1');
    expect(text).toContain('4,320.00');

    // The coordinate run MC rejected is gone from every card, and with it the
    // bare `measure` label that rendered the word "amount" with no value.
    expect(page.findAll('.cc__coord')).toHaveLength(0);
    expect(page.findAll('.cc__measure')).toHaveLength(0);
    expect(text).not.toContain('account_class');
  });

  it('caps a long cell at three lines and says how many more, in words', async () => {
    const page = await mountPage();
    await reveal(page, [1]);
    await settleDrills();

    const shown = page.findAll(`article.cc[data-comment-id="1"] .cc__txn-line`);
    expect(shown).toHaveLength(3);
    // Field by field, as rendered — the whole reason this replaced the chips.
    expect(shown.map((l) => [
      l.find('.cc__txn-date').text(),
      l.find('.cc__txn-account').text(),
      l.find('.cc__txn-who').text(),
      l.find('.cc__txn-desc').text(),
      l.find('.cc__txn-amount').text(),
    ])).toEqual([1, 2, 3].map((k) => [
      `2025-12-0${k}`,
      'HH--TR02 Transport Expense',
      'Titan Trailers (Atlantic Trailers)',
      `Trailer respray leg ${k}`,
      '4,320.00',
    ]));
    const more = page.find('[data-test="cc-txn-more-1"]');
    expect(more.text()).toBe('2 more lines — show all 5');

    // And the full set is one click away, in the table.
    await more.trigger('click');
    await flushPromises();
    expect(page.findAll(`[data-test="cc-lines-1"] tbody tr`)).toHaveLength(5);
  });

  it('a card with two lines does not offer a fold it does not need', async () => {
    const page = await mountPage();
    await reveal(page, [3]);
    await settleDrills();
    expect(page.findAll(`article.cc[data-comment-id="3"] .cc__txn-line`)).toHaveLength(2);
    expect(page.find('[data-test="cc-txn-more-3"]').exists()).toBe(false);
    // A drill that no longer adds up to the commented figure SAYS so.
    expect(cardText(page, 3)).toContain(
      '2 lines, 8,640.00 — does not match the commented 21,600.00 (out by 12,960.00).');
  });

  it('says it is loading, and says when a cell resolves to nothing', async () => {
    const page = await mountPage();
    await reveal(page, [2]);
    // Mid-flight: the card SAYS the lines are coming rather than sitting blank.
    expect(page.find('[data-test="cc-txn-loading-2"]').text())
      .toBe('Loading the transactions behind this figure…');

    await settleDrills();
    // Empty is a finding, not blank space.
    expect(page.find('[data-test="cc-txn-loading-2"]').exists()).toBe(false);
    expect(cardText(page, 2)).toContain('No transactions resolve to this cell.');
    expect(page.findAll(`article.cc[data-comment-id="2"] .cc__txn-line`)).toHaveLength(0);
  });

  it('reports a refused drill on the card that asked for it', async () => {
    const page = await mountPage();
    mocked.drillCubeComment.mockRejectedValueOnce({
      response: { data: { error: 'the pivot refused those coordinates' } },
    });
    await reveal(page, [4]);
    await flushPromises();
    expect(page.find('[data-test="cc-txn-error-4"]').text())
      .toBe('the pivot refused those coordinates');
  });

  it('never asks twice — a card scrolled past keeps what it loaded', async () => {
    const page = await mountPage();
    await reveal(page, [1, 2]);
    await settleDrills();
    expect(mocked.drillCubeComment).toHaveBeenCalledTimes(2);

    // Reported as visible again (scroll-back, or a re-render re-observing).
    await reveal(page, [1, 2]);
    await settleDrills();
    expect(mocked.drillCubeComment).toHaveBeenCalledTimes(2);
    // And it still says what it said.
    expect(cardText(page, 1)).toContain('5 lines, 21,600.00 — matches the commented value.');
  });

  it('a keystroke, a filter change and an open editor cost ZERO fetches', async () => {
    const page = await mountPage();
    await reveal(page, [1, 2, 3]);
    await settleDrills();
    const baseline = mocked.drillCubeComment.mock.calls.length;
    expect(baseline).toBe(3);

    const vm = page.vm as unknown as { filters: { q: string; status: string } };

    // A keystroke re-renders all 113 cards.
    parseCalls.n = 0;
    vm.filters.q = 'note';
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocked.drillCubeComment).toHaveBeenCalledTimes(baseline);
    expect(parseCalls.n).toBe(0);

    // A filter change reloads the register outright.
    vm.filters.status = 'all';
    await flushPromises();
    expect(mocked.drillCubeComment).toHaveBeenCalledTimes(baseline);

    // Opening an editor.
    const editors = page.findAll('[data-test^="cc-edit-"]')
      .filter((b) => /cc-edit-\d+$/.test(b.attributes('data-test') || ''));
    await editors[9].trigger('click');
    await flushPromises();
    expect(mocked.drillCubeComment).toHaveBeenCalledTimes(baseline);

    // And sitting still, with the 5-second feed poll running.
    await new Promise((r) => setTimeout(r, 400));
    expect(mocked.drillCubeComment).toHaveBeenCalledTimes(baseline);
  });

  it('lines arriving do not open every discussion — 113 threads is the same bug', async () => {
    const page = await mountPage();
    await reveal(page, [1, 2, 3, 4, 5]);
    await settleDrills();
    // The disclosure is its own state now. If it were still "has a drill", the
    // transactions landing would expand every card and fetch every thread.
    expect(page.findAll('[data-test="cc-detail-thread"]')).toHaveLength(0);
    expect(mocked.getCubeCommentReplies).not.toHaveBeenCalled();
    expect(page.findAll('[data-test^="cc-lines-"]')).toHaveLength(0);

    await page.find('[data-test="cc-drill-1"]').trigger('click');
    await flushPromises();
    expect(page.findAll('[data-test="cc-detail-thread"]')).toHaveLength(1);
    expect(mocked.getCubeCommentReplies).toHaveBeenCalledTimes(1);
  });
});

/**
 * A cell whose value is NULL.
 *
 * MC's paste of the old card ended with a bare "amount" and nothing after it:
 * the coordinate run rendered the measure name as a label whether or not the
 * cell carried a figure. Whatever replaced it must not do that.
 */
describe('AuditComments — a cell with no value', () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    armDrill();
    mocked.getAuditCubeComments.mockResolvedValue({
      results: [{
        ...register()[2], id: 3, cell_value: null, subject_label: 'Transport · Dec 2025',
      }],
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('renders no dangling label, and a lead line that states the lines only', async () => {
    const page = await mountPage();
    await reveal(page, [3]);
    await settleDrills();

    const text = cardText(page, 3);
    // The headline still names the cell; there is simply no figure beside it.
    expect(text).toContain('Transport · Dec 2025');
    expect(page.find('[data-test="cc-amount-3"]').exists()).toBe(false);
    // No orphaned measure name anywhere on the resting card.
    expect(text).not.toMatch(/\bamount\b/);
    // The lead states what WAS found and claims no reconciliation it cannot
    // make: there is nothing to reconcile against.
    expect(text).toContain('2 lines, 8,640.00');
    expect(text).not.toContain('does not match');
    expect(text).not.toContain('matches the commented value');
  });
});
