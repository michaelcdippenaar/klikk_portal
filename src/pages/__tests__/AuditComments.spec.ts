// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditComments.spec.ts — mount-based spec for src/pages/AuditComments.vue
 * (Audit → Cell comments), covering the reply threads and the auditor gate.
 *
 * The REAL page is mounted with its REAL children — AppPage / PageHeader /
 * FilterBar / KSelect / CubeCommentThreadCell / CommentPopoverCell (reka-ui
 * popover) / CommentThread. Only the network boundary and the auth store are
 * mocked. Popover content teleports to <body>, so panel elements are queried
 * from `document` rather than through the wrapper.
 *
 * Fixtures use the shapes the page actually sees: `filters` arrives as a JSON
 * STRING, `cell_value` may be null, `tags` may be absent, and a comment's
 * anchor is split across row_dims/row_path and col_dims/col_path.
 *
 * What is verified:
 *   - the register loads from /audit/cube-comments/ (getAuditCubeComments) for
 *     EVERY role — the /xero/data/ list is never called
 *   - the row comment icon renders reply_count as its badge
 *   - opening the icon fetches that comment's replies and does NOT bubble a
 *     click to the row element
 *   - a top-level post calls postCubeCommentReply with NO parentId; a reply
 *     passes the parent id
 *   - replies render nested under their parent, with authors
 *   - a feed event for a visible row bumps its badge; one for an unknown row
 *     changes nothing; the register is not refetched
 *   - auditor mode: no verdict select, no status buttons, no undo bar, no
 *     drill-down — but the register, its filters and the thread survive, and
 *     the thread is still postable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// ── Mocks — the network boundary only ───────────────────────────────────────
//
// The pure helpers (commentCoordinates / normaliseFilters / DECISIONS) stay
// REAL: re-implementing them here would let the page and the spec drift.

vi.mock('../../api/cubeComments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/cubeComments')>();
  return {
    ...actual,
    getComments: vi.fn(),
    getAuditCubeComments: vi.fn(),
    getCubeCommentReplies: vi.fn(),
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

// KSelect is stubbed with a plain <select> for stable `data-test` hooks and a
// cheap mount; this spec is about threads and the auditor gate, not the filter
// widget.
//
// It used to be stubbed for a second reason: this page's Kind / Verdict /
// Author filters offer options whose value is the empty string, and reka-ui's
// SelectItem throws on one ("A <SelectItem /> must have a value prop that is
// not an empty string"), which killed the mount. That defect was real — it is
// why MC saw no select-all on the author filter — and it is now FIXED in
// KSelect, which carries "" past reka-ui behind an internal sentinel. The real
// widget is exercised against a ""-valued option in
// components/klikk/__tests__/KSelect.emptyOption.spec.ts, and the page's own
// author filter is exercised with the REAL KSelect in
// AuditComments.authorFilter.spec.ts. Do not re-file it.
vi.mock('../../components/klikk/KSelect.vue', () => ({
  default: defineComponent({
    name: 'KSelect',
    props: {
      modelValue: { type: [String, Number], default: '' },
      label: { type: String, default: '' },
      options: { type: Array, default: () => [] },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('label', { class: 'kselect-stub' }, [
        props.label,
        h('select', {
          value: String(props.modelValue ?? ''),
          'data-test': `filter-${props.label.toLowerCase()}`,
          onChange: (e: Event) =>
            emit('update:modelValue', (e.target as HTMLSelectElement).value),
        }, (props.options as Array<{ label: string; value: string }>).map((o) =>
          h('option', { value: String(o.value ?? ''), key: String(o.value ?? '') }, o.label))),
      ]);
    },
  }),
}));

const toastCalls = vi.hoisted(() => ({
  info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn(),
}));
vi.mock('../../composables/useToast', () => ({ useToast: () => toastCalls }));

// The page reads the auth store for auditor UI-gating; controllable stub.
const mockAuth = vi.hoisted(() => ({ isAuditor: false, user: { username: 'mc', role: 'standard' } }));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mockAuth }));

import * as api from '../../api/cubeComments';
import { getCommentFeed } from '../../api/comments';
import AuditComments from '../AuditComments.vue';

const mocked = api as unknown as {
  getComments: ReturnType<typeof vi.fn>;
  getAuditCubeComments: ReturnType<typeof vi.fn>;
  getCubeCommentReplies: ReturnType<typeof vi.fn>;
  postCubeCommentReply: ReturnType<typeof vi.fn>;
  setCubeCommentStatus: ReturnType<typeof vi.fn>;
  setCommentDecision: ReturnType<typeof vi.fn>;
  drillCubeComment: ReturnType<typeof vi.fn>;
};
const mockedFeed = getCommentFeed as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures — production shapes ────────────────────────────────────────────

const CUBE_ROW = {
  id: 41,
  subject_type: 'cube_cell',
  subject_label: 'Repairs & maintenance · Aug 2026',
  comment: 'This looks like the trailer respray — check it is not capitalised.',
  author: 'MC',
  author_key: 'mc',
  status: 'open',
  decision: '',
  tags: [],
  updated_at: '2026-08-20T10:00:00Z',
  row_dims: ['account'],
  row_path: ['6100 Repairs & maintenance'],
  col_dims: ['month'],
  col_path: '2026-08',
  measure: 'amount',
  cell_value: '21600.00',
  // The API hands filters back as a JSON STRING, not an object.
  filters: '{"fy": "2026", "entity": "Klikk"}',
  reply_count: 2,
};

const BANK_ROW = {
  id: 42,
  subject_type: 'bank_txn',
  subject_label: 'Investec · 2026-08-04 · R259.00',
  comment: 'Personal? Ask MC.',
  author: 'anine',
  author_key: 'anine',
  status: 'open',
  decision: '',
  tags: ['vat'],
  updated_at: '2026-08-21T08:30:00Z',
  row_dims: [],
  row_path: [],
  col_dims: [],
  col_path: 'Total',
  measure: 'amount',
  cell_value: null,
  filters: null,
  reply_count: 0,
};

const REPLIES = [
  { id: 900, parent_id: null, author: 'MC', text: 'Anine, can you pull the invoice?', created_at: '2026-08-20T11:00:00Z' },
  { id: 901, parent_id: 900, author: 'anine', text: 'Pulled — it is a repair.', created_at: '2026-08-20T12:00:00Z' },
];

// ── Harness ─────────────────────────────────────────────────────────────────

function mountPage() {
  return mount(AuditComments, { attachTo: document.body });
}

/** One card per register row. */
function cards(w: ReturnType<typeof mount>) {
  return w.findAll('article.cc');
}

function badges(w: ReturnType<typeof mount>) {
  return w.findAll('[data-test="inline-comment-count"]').map((n) => n.text());
}

/** Popover panel content teleports to <body>. */
function q<T extends Element = HTMLElement>(sel: string): T | null {
  return document.body.querySelector(sel) as T | null;
}

function panelOpen(): boolean {
  return q('[data-test="comment-input"]') !== null;
}

async function openThread(w: ReturnType<typeof mount>, index = 0) {
  await w.findAll('[data-test="inline-comment-trigger"]')[index].trigger('click');
  await flushPromises();
  expect(panelOpen(), 'thread popover should be open').toBe(true);
}

async function typeAndSubmit(inputSel: string, submitSel: string, text: string) {
  const input = q<HTMLTextAreaElement>(inputSel)!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  const button = q<HTMLButtonElement>(submitSel)!;
  button.click();
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  mockAuth.isAuditor = false;
  mockAuth.user = { username: 'mc', role: 'standard' };
  // A FRESH copy per call: the page mutates its rows in place (reply_count,
  // status), so sharing the fixture object would leak state between tests.
  mocked.getAuditCubeComments.mockImplementation(async () => ({
    results: [{ ...CUBE_ROW }, { ...BANK_ROW, tags: [...BANK_ROW.tags] }],
  }));
  mocked.getCubeCommentReplies.mockResolvedValue({ comment_id: 41, replies: REPLIES });
  mocked.postCubeCommentReply.mockImplementation(async (_id, text) => ({
    id: 950, parent_id: null, author: 'mc', text, created_at: '2026-08-22T07:00:00Z',
  }));
  mockedFeed.mockResolvedValue({ now: null, events: [] });
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ── The register ────────────────────────────────────────────────────────────

describe('AuditComments — register', () => {
  it('loads from the audit endpoint, never the /xero/data/ list', async () => {
    const w = mountPage();
    await flushPromises();

    expect(mocked.getAuditCubeComments).toHaveBeenCalledTimes(1);
    expect(mocked.getComments).not.toHaveBeenCalled();
    expect(mocked.getAuditCubeComments.mock.calls[0][0]).toMatchObject({ status: 'open' });
    expect(cards(w).length).toBe(2);
    expect(w.text()).toContain('trailer respray');
    w.unmount();
  });
});

// ── Threads ─────────────────────────────────────────────────────────────────

describe('AuditComments — reply threads', () => {
  it('each row carries a comment icon badged with reply_count', async () => {
    const w = mountPage();
    await flushPromises();

    expect(w.findAll('[data-test="inline-comment-trigger"]').length).toBe(2);
    expect(badges(w)).toEqual(['2', '0']);
    w.unmount();
  });

  it('opening the icon fetches that comment’s replies and does not click the row', async () => {
    const w = mountPage();
    await flushPromises();

    // A real listener on the card: @click.stop must keep the click off it.
    const rowClick = vi.fn();
    cards(w)[0].element.addEventListener('click', rowClick);

    await openThread(w, 0);

    expect(mocked.getCubeCommentReplies).toHaveBeenCalledWith(41);
    expect(rowClick).not.toHaveBeenCalled();
    w.unmount();
  });

  it('renders replies nested under their parent, with authors', async () => {
    const w = mountPage();
    await flushPromises();
    await openThread(w, 0);

    const roots = document.body.querySelectorAll('[data-test="comment"]');
    const nested = document.body.querySelectorAll('[data-test="comment-reply"]');
    expect(roots.length).toBe(1);
    expect(nested.length).toBe(1);
    expect(roots[0].textContent).toContain('Anine, can you pull the invoice?');
    expect(nested[0].textContent).toContain('Pulled — it is a repair.');
    expect(nested[0].textContent).toContain('anine');
    // The nested reply really is inside the parent's list, not a sibling card.
    expect(roots[0].parentElement!.contains(nested[0])).toBe(true);
    w.unmount();
  });

  it('a top-level post sends no parentId, and the badge bumps without a reload', async () => {
    const w = mountPage();
    await flushPromises();
    await openThread(w, 0);

    await typeAndSubmit('[data-test="comment-input"]', '[data-test="comment-submit"]', '  Agreed — repair.  ');

    expect(mocked.postCubeCommentReply).toHaveBeenCalledTimes(1);
    const [id, text, opts] = mocked.postCubeCommentReply.mock.calls[0];
    expect(id).toBe(41);
    expect(text).toBe('Agreed — repair.');
    // The options object is omitted entirely for a top-level reply, so the
    // API layer cannot put `parent_id: null` on the wire.
    expect(opts).toBeUndefined();

    expect(badges(w)[0]).toBe('3');
    expect(mocked.getAuditCubeComments).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it('replying to a comment passes that comment’s id as the parent', async () => {
    const w = mountPage();
    await flushPromises();
    await openThread(w, 0);

    q<HTMLButtonElement>('[data-test="comment-reply-900"]')!.click();
    await flushPromises();

    await typeAndSubmit(
      '[data-test="comment-reply-input-900"]',
      '[data-test="comment-reply-submit-900"]',
      'Thanks.',
    );

    expect(mocked.postCubeCommentReply).toHaveBeenCalledWith(41, 'Thanks.', { parentId: 900 });
    w.unmount();
  });

  it('a failed post keeps the draft and does not bump the badge', async () => {
    mocked.postCubeCommentReply.mockRejectedValueOnce(new Error('boom'));
    const w = mountPage();
    await flushPromises();
    await openThread(w, 0);

    await typeAndSubmit('[data-test="comment-input"]', '[data-test="comment-submit"]', 'Lost?');

    expect(q('[data-test="comment-error"]')).not.toBeNull();
    expect(q<HTMLTextAreaElement>('[data-test="comment-input"]')!.value).toBe('Lost?');
    expect(badges(w)[0]).toBe('2');
    w.unmount();
  });
});

// ── Live feed ───────────────────────────────────────────────────────────────

describe('AuditComments — live comment feed', () => {
  function feedEvent(commentId: number, id = 990, author = 'anine') {
    return {
      kind: 'cube_comment',
      object_id: String(commentId),
      object_ref: 'Repairs & maintenance · Aug 2026',
      comment: { id, parent_id: null, author, text: 'someone else replied', created_at: '2026-08-22T09:00:00Z' },
    };
  }

  it('an event for a visible row bumps that badge only, with no list refetch', async () => {
    // The mount-time poll only primes the cursor, so the event lands on the next.
    vi.useFakeTimers();
    try {
      mockedFeed.mockReset().mockResolvedValueOnce({ now: 'c0', events: [] });
      mockedFeed.mockResolvedValue({ now: 'c1', events: [feedEvent(41)] });
      const w = mountPage();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(badges(w)).toEqual(['3', '0']);
      expect(mocked.getAuditCubeComments).toHaveBeenCalledTimes(1);

      // The same event again must not double-count it.
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();
      expect(badges(w)).toEqual(['3', '0']);
      w.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an event for a comment that is not on this page changes nothing', async () => {
    vi.useFakeTimers();
    try {
      mockedFeed.mockReset().mockResolvedValueOnce({ now: 'c0', events: [] });
      mockedFeed.mockResolvedValue({ now: 'c1', events: [feedEvent(9999)] });
      const w = mountPage();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(badges(w)).toEqual(['2', '0']);
      w.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('events of another kind are ignored', async () => {
    vi.useFakeTimers();
    try {
      mockedFeed.mockReset().mockResolvedValueOnce({ now: 'c0', events: [] });
      mockedFeed.mockResolvedValue({
        now: 'c1',
        events: [{ ...feedEvent(41), kind: 'receipt' }],
      });
      const w = mountPage();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(badges(w)).toEqual(['2', '0']);
      w.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── Auditor mode ────────────────────────────────────────────────────────────

describe('AuditComments — auditor mode', () => {
  beforeEach(() => {
    mockAuth.isAuditor = true;
    mockAuth.user = { username: 'anzelle', role: 'auditor' };
  });

  afterEach(() => {
    mockAuth.isAuditor = false;
    mockAuth.user = { username: 'mc', role: 'standard' };
  });

  it('reads the register through the same audit endpoint', async () => {
    const w = mountPage();
    await flushPromises();

    expect(mocked.getAuditCubeComments).toHaveBeenCalledTimes(1);
    expect(mocked.getComments).not.toHaveBeenCalled();
    expect(cards(w).length).toBe(2);
    w.unmount();
  });

  it('hides every control that would 403 — status, verdict, undo, drill', async () => {
    const w = mountPage();
    await flushPromises();

    const labels = w.findAll('button').map((b) => b.text());
    expect(labels).not.toContain('Actioned');
    expect(labels).not.toContain('Dismiss');
    expect(labels).not.toContain('Reopen');
    expect(labels).not.toContain('Show transactions');
    expect(w.find('.cc__verdict select').exists()).toBe(false);
    expect(w.find('.cc__drill').exists()).toBe(false);
    expect(w.find('.cc-undo').exists()).toBe(false);
    w.unmount();
  });

  it('keeps the register readable — filters, anchors and read-only tags', async () => {
    const w = mountPage();
    await flushPromises();

    // Filters (the FilterBar selects/inputs) are untouched.
    expect(w.findAll('.cc__coord').length).toBeGreaterThan(0);
    expect(w.text()).toContain('trailer respray');
    expect(w.text()).toContain('Personal? Ask MC.');
    // The verdict WRAPPER survives for its read-only tags; only the select goes.
    expect(w.findAll('.cc__tag').map((t) => t.text())).toContain('vat');
    w.unmount();
  });

  it('can still open a thread and post a reply', async () => {
    const w = mountPage();
    await flushPromises();

    expect(w.findAll('[data-test="inline-comment-trigger"]').length).toBe(2);
    await openThread(w, 0);
    expect(mocked.getCubeCommentReplies).toHaveBeenCalledWith(41);

    await typeAndSubmit('[data-test="comment-input"]', '[data-test="comment-submit"]', 'Noted for the file.');

    expect(mocked.postCubeCommentReply).toHaveBeenCalledWith(41, 'Noted for the file.');
    expect(badges(w)[0]).toBe('3');
    w.unmount();
  });
});
