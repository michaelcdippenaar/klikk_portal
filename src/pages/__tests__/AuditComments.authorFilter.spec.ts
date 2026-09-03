// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditComments.authorFilter.spec — the author filter, with the REAL KSelect.
 *
 * MC's report was "the author filter has no select-all". The option had been
 * there all along as `{ label: 'Everyone', value: '' }`; reka-ui throws on an
 * empty-string SelectItem value, and because the throw lands while the option
 * list is being built it took the entire dropdown with it. Nothing was logged
 * anywhere a user would look — the control just stopped offering choices.
 *
 * The sibling spec AuditComments.spec.ts stubs KSelect out. This one does NOT:
 * a stubbed <select> cannot reproduce the defect, so the guard has to drive the
 * real widget.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
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

// reka-ui opens on pointerdown and uses the Pointer Capture API, which
// happy-dom does not implement. Without these the dropdown never opens.
beforeAll(() => {
  const p = Element.prototype as unknown as Record<string, unknown>;
  p.hasPointerCapture = () => false;
  p.setPointerCapture = () => {};
  p.releasePointerCapture = () => {};
  p.scrollIntoView = () => {};
});

/**
 * The register's real shape as of 2026-09-03: 8 distinct authors, author and
 * author_key agreeing on every row, and "MC (To Review)" as a DELIBERATE
 * attribution of 55 rows MC may have written himself — not missing data.
 */
const AUTHORS: [string, number][] = [
  ['MC (To Review)', 3],
  ['MC', 2],
  ['codex:fy2026-bank-review', 1],
  ['claude:year-end-audit', 1],
];

function register() {
  const rows: Record<string, unknown>[] = [];
  let id = 1;
  AUTHORS.forEach(([who, n]) => {
    for (let i = 0; i < n; i += 1) {
      rows.push({
        id: id++, subject_type: 'cube_cell', subject_label: `cell ${id}`,
        comment: `note from ${who}`, author: who, author_key: who,
        status: 'open', decision: '', tags: [], updated_at: '2026-09-03T10:00:00Z',
        row_dims: ['account'], row_path: ['6100 Repairs'], col_dims: ['month'],
        col_path: '2026-08', measure: 'amount', cell_value: '100.00',
        filters: null, reply_count: 0,
      });
    }
  });
  return rows;
}

const TOTAL = AUTHORS.reduce((a, [, n]) => a + n, 0);

let wrapper: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAuditCubeComments.mockResolvedValue({ results: register() });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

async function mountPage() {
  wrapper = mount(AuditComments, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

/** The author filter's trigger — the 4th KSelect in the bar. */
function authorTrigger(w: ReturnType<typeof mount>) {
  const labels = w.findAll('.kselect-root');
  const root = labels.find((n) => n.text().startsWith('Author'));
  expect(root, 'author filter is on the page').toBeTruthy();
  return root!.find('.kselect-trigger');
}

async function openAuthors(w: ReturnType<typeof mount>) {
  await authorTrigger(w).trigger('pointerdown', { button: 0, pointerType: 'mouse' });
  await new Promise((r) => setTimeout(r, 150));
  return [...document.querySelectorAll('.kselect-item')].map((n) => n.textContent?.trim() ?? '');
}

describe('AuditComments — the author filter', () => {
  it('offers a select-all row that actually renders', async () => {
    const w = await mountPage();
    const items = await openAuthors(w);
    // The whole complaint. Before the fix this array was EMPTY — the
    // ""-valued select-all row threw and took every author down with it.
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toBe(`Everyone (${TOTAL})`);
  });

  it('lists every distinct author, with counts, commonest first', async () => {
    const w = await mountPage();
    const items = await openAuthors(w);
    expect(items).toEqual([
      `Everyone (${TOTAL})`,
      'MC (To Review) (3)',
      'MC (2)',
      'claude:year-end-audit (1)',
      'codex:fy2026-bank-review (1)',
    ]);
  });

  it('treats "MC (To Review)" as a first-class author, not as unattributed', async () => {
    const w = await mountPage();
    const items = await openAuthors(w);
    expect(items).toContain('MC (To Review) (3)');
    expect(items.join(' ')).not.toContain('No author recorded');
  });

  it('select-all shows the whole register, and picking one author narrows it', async () => {
    const w = await mountPage();
    expect(w.findAll('article.cc')).toHaveLength(TOTAL);

    await openAuthors(w);
    const mc = [...document.querySelectorAll('.kselect-item')]
      .find((n) => n.textContent?.trim() === 'MC (To Review) (3)') as HTMLElement;
    mc.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await flushPromises();
    expect(w.findAll('article.cc')).toHaveLength(3);

    // …and back to all of them, which is the thing MC could not do.
    await openAuthors(w);
    const everyone = [...document.querySelectorAll('.kselect-item')]
      .find((n) => n.textContent?.trim() === `Everyone (${TOTAL})`) as HTMLElement;
    everyone.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await flushPromises();
    expect(w.findAll('article.cc')).toHaveLength(TOTAL);
  });

  it('surfaces rows carrying neither key nor name instead of stranding them', async () => {
    // Not reachable in today's register, but a row with no author at all would
    // otherwise show under "Everyone" and be filterable to by nothing.
    const rows = register();
    rows.push({ ...rows[0], id: 999, author: '', author_key: '' });
    mocked.getAuditCubeComments.mockResolvedValue({ results: rows });
    const w = await mountPage();
    const items = await openAuthors(w);
    expect(items).toContain('No author recorded (1)');
  });
});
