// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditComments.filterContext.spec — the anchor's filters must inform, not flood.
 *
 * A comment written in the Excel add-in stores a filter_context whose `dimf`
 * is a JSON blob of {dimension: [members]}. After the subset picker's "add all
 * shown", that blob enumerated every year and every month — 12 and 144 values
 * — and the card rendered it verbatim, burying the comment MC had written.
 * His words: "It clutters the space. Does not happen where Claude posts."
 *
 * The add-in now omits an all-members subset at the source, but the ~113
 * comments already in app.cube_comments keep their verbose anchors and are NOT
 * being rewritten. So the console has to fold them — collapsed by default,
 * expandable, nothing lost.
 *
 * 2026-09-04, CDO pass: the fold got one rung DEEPER. MC reads ~121 of these
 * and the open filter run was the largest thing on a card whose largest thing
 * should be the comment, so the whole run now rests behind ONE disclosure line
 * that names the FIELDS ("Under filters: tenant, journal_type, year"). Opening
 * it shows every field with long member lists still trimmed; a second control
 * shows every value. Every value is still reachable — in two clicks instead of
 * one — and the two "+N more" counters that used to appear on one card meaning
 * two different things now say "fields" and "values" in words.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../api/cubeComments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/cubeComments')>();
  return {
    ...actual,
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
vi.mock('../../api/people', () => ({
  getPeople: vi.fn().mockResolvedValue({
    count: 4,
    results: [
      { id: 1, handle: 'auditor', display_name: 'George du Preez', email: 'george@moore.co.za', active: true },
      { id: 2, handle: 'bookkeeper', display_name: 'Anzelle Vermaak', email: 'anzelle@moore.co.za', active: true },
      { id: 3, handle: 'jordyn', display_name: 'Jordyn Wolhuter', email: 'jordyn@klikk.co.za', active: false },
      { id: 4, handle: 'mc', display_name: 'MC Dippenaar', email: 'mc@tremly.com', active: true },
    ],
  }),
}));
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

const YEARS = Array.from({ length: 12 }, (_, i) => String(2015 + i));
const MONTHS = YEARS.flatMap((y) =>
  Array.from({ length: 12 }, (_, m) => `${y}-${String(m + 1).padStart(2, '0')}`));

/** Exactly what the add-in used to store: every year, every month. */
const FLOODED_DIMF = JSON.stringify({ year: YEARS, month: MONTHS });

function row(over: Record<string, unknown> = {}) {
  return {
    id: 41, subject_type: 'cube_cell', subject_label: 'Repairs · Aug 2026',
    comment: 'This looks like the trailer respray — check it is not capitalised.',
    author: 'MC (To Review)', author_key: 'MC (To Review)',
    status: 'open', decision: '', tags: [], updated_at: '2026-09-03T10:00:00Z',
    row_dims: ['account'], row_path: ['6100 Repairs'], col_dims: ['month'],
    col_path: '2026-08', measure: 'amount', cell_value: '21600.00',
    reply_count: 0,
    // The API hands filters back as a JSON STRING on some paths.
    filters: JSON.stringify({ tenant: 'Klikk', journal_type: 'ACCREC', dimf: FLOODED_DIMF }),
    ...over,
  };
}

let wrapper: ReturnType<typeof mount> | null = null;
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = ''; });

async function page(rows: Record<string, unknown>[]) {
  mocked.getAuditCubeComments.mockResolvedValue({ results: rows });
  wrapper = mount(AuditComments, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const chipText = (w: ReturnType<typeof mount>) =>
  w.findAll('.cc__filters .cc__filter').map((n) => n.text());
/** The resting line: the one thing the filter context shows before it is asked. */
const contextBtn = (w: ReturnType<typeof mount>) => w.find('.cc__context-toggle');
/** The values control INSIDE an opened run. */
const moreBtn = (w: ReturnType<typeof mount>) => w.find('.cc__filter--more');
/** Open one card's filter run. */
async function openContext(w: ReturnType<typeof mount>, i = 0) {
  await w.findAll('.cc__context-toggle')[i].trigger('click');
  return w;
}

describe('AuditComments — the anchor filter context', () => {
  it('rests as ONE line that names the fields and says how many more there are', async () => {
    const w = await page([row()]);
    // Nothing of the run is rendered until it is asked for.
    expect(w.find('.cc__filters').exists()).toBe(false);
    // Assert on what the reader SEES, not on the reactive behind it.
    expect(contextBtn(w).text()).toBe('Under filters: tenant, journal_type, year +1 more field');
    expect(contextBtn(w).attributes('aria-expanded')).toBe('false');
  });

  it('says "fields" where it counts fields — never a bare "+1 more"', async () => {
    // The ambiguity this replaces: "+1 more" appeared with two meanings on one
    // card — chips folded away, and values folded inside a chip.
    const w = await page([row()]);
    expect(contextBtn(w).text()).toContain('more field');
    await openContext(w);
    const month = chipText(w).find((c) => c.startsWith('month:'))!;
    expect(month).toContain('more values');
    expect(month).not.toMatch(/\+\d+ more$/);
  });

  it('does not dump the raw dimf JSON onto the card', async () => {
    const w = await page([row()]);
    await openContext(w);
    const shown = w.find('.cc__filters').text();
    expect(shown).not.toContain('{"year"');
    expect(shown).not.toContain('[');
    // The blob is 144 months long; the opened card must be nowhere near it.
    expect(shown.length).toBeLessThan(220);
    expect(FLOODED_DIMF.length).toBeGreaterThan(1500);
  });

  it('names each dimension instead of one opaque "dimf" chip', async () => {
    const w = await page([row()]);
    await openContext(w);
    const chips = chipText(w);
    expect(chips.some((c) => c.startsWith('year:'))).toBe(true);
    expect(chips.some((c) => c.startsWith('month:'))).toBe(true);
    expect(chips.some((c) => c.startsWith('dimf:'))).toBe(false);
  });

  it('summarises a long member list and says how much is folded', async () => {
    const w = await page([row()]);
    await openContext(w);
    const month = chipText(w).find((c) => c.startsWith('month:'))!;
    expect(month).toBe('month: 2015-01, 2015-02, 2015-03 +141 more values');
    expect(moreBtn(w).exists()).toBe(true);
  });

  it('keeps the scalar anchor filters visible — they identify the figure', async () => {
    const w = await page([row()]);
    await openContext(w);
    const chips = chipText(w).join(' | ');
    // Folding must never cost the reader the cut the number came from.
    expect(chips).toContain('tenant: Klikk');
    expect(chips).toContain('journal_type: ACCREC');
  });

  it('expands to every value, folds back to trimmed, and closes altogether', async () => {
    const w = await page([row()]);
    await openContext(w);
    await moreBtn(w).trigger('click');
    const opened = w.find('.cc__filters').text();
    expect(opened).toContain('2026-12');       // the last of the 144
    expect(opened).toContain('2015-01');
    expect(moreBtn(w).text()).toBe('Fewer values');

    await moreBtn(w).trigger('click');
    expect(w.find('.cc__filters').text()).not.toContain('2026-12');
    expect(moreBtn(w).text()).toBe('Show all values');

    // And the whole run folds away again.
    expect(contextBtn(w).text()).toBe('Hide filters');
    await contextBtn(w).trigger('click');
    expect(w.find('.cc__filters').exists()).toBe(false);
  });

  it('offers no values toggle when the whole anchor already fits', async () => {
    const w = await page([row({
      id: 42,
      filters: JSON.stringify({ tenant: 'Klikk', dimf: JSON.stringify({ year: ['2026'] }) }),
    })]);
    // Two fields, both short: the resting line names them and counts nothing.
    expect(contextBtn(w).text()).toBe('Under filters: tenant, year');
    await openContext(w);
    expect(chipText(w)).toEqual(['tenant: Klikk', 'year: 2026']);
    expect(moreBtn(w).exists()).toBe(false);
  });

  it('expands one card without expanding the others', async () => {
    const w = await page([row(), row({ id: 42 })]);
    await openContext(w, 0);
    const cards = w.findAll('article.cc');
    expect(cards[0].find('.cc__filters').exists()).toBe(true);
    expect(cards[1].find('.cc__filters').exists()).toBe(false);
    await cards[0].find('.cc__filter--more').trigger('click');
    expect(cards[0].find('.cc__filters').text()).toContain('2026-12');
  });

  it('shows an unparseable dimf raw rather than dropping it', async () => {
    // These values say which figure the comment is about. Unreadable beats
    // silently absent.
    const w = await page([row({ filters: JSON.stringify({ dimf: 'not json{' }) })]);
    await openContext(w);
    expect(chipText(w).join(' ')).toContain('not json{');
  });

  it('renders an agent-written anchor unchanged — it was never the problem', async () => {
    const w = await page([row({
      author: 'claude:year-end-audit',
      filters: { tenant: 'Klikk', dimf: { fin_year: ['FY2026'] } },
    })]);
    await openContext(w);
    expect(chipText(w)).toEqual(['tenant: Klikk', 'fin_year: FY2026']);
    expect(moreBtn(w).exists()).toBe(false);
  });

  it('treats the filter values as data, never as markup', async () => {
    const w = await page([row({
      filters: JSON.stringify({ tenant: '<img src=x onerror=alert(1)>' }),
    })]);
    await openContext(w);
    const el = w.find('.cc__filters');
    expect(el.text()).toContain('<img src=x onerror=alert(1)>');
    expect(el.html()).not.toContain('<img');
  });

  it('offers no disclosure at all when a comment carries no filters', async () => {
    const w = await page([row({ filters: JSON.stringify({}) })]);
    expect(contextBtn(w).exists()).toBe(false);
  });
});
