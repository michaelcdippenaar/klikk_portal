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

// Counts real parses by wrapping the one function every anchor read goes
// through. A spy here is the honest measure — timings vary with machine load,
// call counts do not.
const parseCalls = vi.hoisted(() => ({ n: 0 }));

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
  }));
}

let w: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  parseCalls.n = 0;
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
