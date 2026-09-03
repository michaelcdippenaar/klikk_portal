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
vi.setConfig({ testTimeout: 30_000 });

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

const mocked = api as unknown as { getAuditCubeComments: ReturnType<typeof vi.fn> };

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

  it('parses nothing when a card is expanded', async () => {
    const page = await mountPage();
    parseCalls.n = 0;
    await page.find('.cc__filter--more').trigger('click');
    await flushPromises();
    expect(parseCalls.n).toBe(0);
  });

  it('still folds correctly at scale — every card, not just the first', async () => {
    const page = await mountPage();
    const texts = page.findAll('article.cc').map((c) => c.find('.cc__filters').text());
    expect(texts).toHaveLength(REGISTER_SIZE);
    texts.forEach((t) => {
      expect(t).not.toContain('{"year"');
      expect(t).toContain('tenant: Klikk');
      expect(t).toContain('+');
    });
  });

  it('expanding one card at scale leaves the other 112 folded', async () => {
    const page = await mountPage();
    const cards = page.findAll('article.cc');
    await cards[0].find('.cc__filter--more').trigger('click');
    expect(cards[0].find('.cc__filters').text()).toContain('2026-12');
    const others = cards.slice(1)
      .filter((c) => c.find('.cc__filters').text().includes('2026-12'));
    expect(others).toHaveLength(0);
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
    const chips = page.findAll('[data-test^="cc-assignee-"]');
    expect(chips).toHaveLength(ASSIGNED_ROWS);
    const texts = chips.map((c) => c.text());
    // The PERSON is shown; the handle is what the title carries.
    expect(texts.filter((t) => t.includes('Anzelle Vermaak')).length).toBeGreaterThan(0);
    expect(texts.every((t) => !t.includes('bookkeeper'))).toBe(true);
    // A stood-down seat says so in words, not by colour alone.
    expect(texts.filter((t) => t.includes('Jordyn Wolhuter'))
      .every((t) => t.includes('no longer active'))).toBe(true);

    // ── what it offers ──
    const options = (page.vm as unknown as {
      assigneeOptions: Array<{ label: string; value: string }>;
    }).assigneeOptions;
    expect(options.map((o) => o.value)).not.toContain('jordyn');
    expect(options.map((o) => o.label).join(' ')).not.toContain('Jordyn');

    // ── what it cost ──
    // Two reads per ASSIGNED row (the name, and whether the seat is still
    // held), plus a small constant for the four-seat directory the filter is
    // built from. The number that matters is the coefficient: bounded by the
    // rows that carry a seat, and — see the next test — not paid again on the
    // next render. A template-side `labelFor()` would pay all of it on every
    // keystroke and every 5-second feed poll.
    expect(seatReads.n).toBeLessThanOrEqual(ASSIGNED_ROWS * 2 + 16);
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

    // Expanding one card's anchor.
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
});
