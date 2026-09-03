// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditComments.assignment.spec — who a comment is with, and the verdict
 * control that is no longer there.
 *
 * TWO things that look unrelated and are not. Both are about the same
 * property of the register: `app.cube_comments` is upserted ON CONFLICT
 * (subject_type, subject_key, author_key), and `author_key` is stamped by the
 * server from the credential rather than read from the payload.
 *
 *   - The VERDICT selector POSTed a whole comment back to /xero/data/comments/
 *     to record a decision. That endpoint 400s outright on 'cube_cell' (98 of
 *     the register's rows), and on the kinds it accepts it would have inserted
 *     a SECOND row carrying someone else's text under the requester's name
 *     rather than amending theirs. It is gone, and nothing in the UI may reach
 *     that path.
 *
 *   - ASSIGNMENT is read-only here for exactly the same reason: `assignee` is
 *     only accepted by those same upserts, so there is no way to route a
 *     comment written by 'MC (To Review)' or 'claude:year-end-audit' without
 *     forking it. The page shows assignment and filters on it; it offers no
 *     control that writes it, and this spec pins that.
 *
 * Fixtures use production shapes: `filters` arrives as a JSON string,
 * `assignee_role` is a HANDLE and not a person, and the directory contains an
 * INACTIVE seat — the one the console must never offer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

vi.mock('../../api/cubeComments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/cubeComments')>();
  return {
    ...actual,
    getComments: vi.fn(),
    getAuditCubeComments: vi.fn(),
    getCubeCommentReplies: vi.fn().mockResolvedValue({ comment_id: 0, replies: [] }),
    postCubeCommentReply: vi.fn(),
    setCubeCommentStatus: vi.fn(),
    setCommentDecision: vi.fn(),
    drillCubeComment: vi.fn(),
  };
});

// The live directory as at 2026-09-03. `jordyn` is INACTIVE and is included on
// purpose: a fixture of only active people cannot catch the console offering
// someone the server would refuse with a 400.
const DIRECTORY = [
  { id: 1, handle: 'auditor', display_name: 'George du Preez', email: 'george@moore.co.za', active: true },
  { id: 2, handle: 'bookkeeper', display_name: 'Anzelle Vermaak', email: 'anzelle@moore.co.za', active: true },
  { id: 3, handle: 'jordyn', display_name: 'Jordyn Wolhuter', email: 'jordyn@klikk.co.za', active: false },
  { id: 4, handle: 'mc', display_name: 'MC Dippenaar', email: 'mc@tremly.com', active: true },
];
const peopleCalls = vi.hoisted(() => ({ fn: null as unknown as ReturnType<typeof vi.fn> }));
vi.mock('../../api/people', () => {
  peopleCalls.fn = vi.fn();
  return { getPeople: peopleCalls.fn };
});

vi.mock('../../api/comments', () => ({
  getCommentFeed: vi.fn().mockResolvedValue({ now: null, events: [] }),
}));
vi.mock('../../composables/useToast', () => ({
  useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

// A plain <select> stands in for KSelect, for the same reason the sibling spec
// does it: stable data-test hooks and a cheap mount. The real widget is
// exercised against this page in AuditComments.authorFilter.spec.ts.
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
          'data-test': `filter-${props.label.toLowerCase().replace(/\s+/g, '-')}`,
          onChange: (e: Event) =>
            emit('update:modelValue', (e.target as HTMLSelectElement).value),
        }, (props.options as Array<{ label: string; value: string }>).map((o) =>
          h('option', { value: String(o.value ?? ''), key: String(o.value ?? '') }, o.label))),
      ]);
    },
  }),
}));

const mockAuth = vi.hoisted(() => ({
  isAuditor: false,
  user: { username: 'mc', email: 'mc@tremly.com', role: 'standard' } as Record<string, unknown>,
}));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mockAuth }));

import * as api from '../../api/cubeComments';
import AuditComments from '../AuditComments.vue';

const mocked = api as unknown as {
  getComments: ReturnType<typeof vi.fn>;
  getAuditCubeComments: ReturnType<typeof vi.fn>;
  setCommentDecision: ReturnType<typeof vi.fn>;
};

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// One of each: a cube cell with a live seat, a bank transaction with none, and
// a cube cell sitting with a seat that has since been stood down. The bank row
// carries `decision` and `tags`, because those are what the removed verdict
// control lived beside.

const WITH_SEAT = {
  id: 41, subject_type: 'cube_cell', subject_label: 'Repairs & maintenance · Aug 2026',
  comment: 'Check this is not capitalised.', author: 'MC (To Review)', author_key: 'MC (To Review)',
  status: 'open', decision: '', tags: [], updated_at: '2026-08-20T10:00:00Z',
  row_dims: ['account'], row_path: ['6100 Repairs'], col_dims: ['month'], col_path: '2026-08',
  measure: 'amount', cell_value: '21600.00', filters: '{"fy": "2026", "entity": "Klikk"}',
  reply_count: 0, assignee_role: 'bookkeeper',
};
const NO_SEAT = {
  id: 42, subject_type: 'bank_txn', subject_label: 'Investec · 2026-08-04 · R259.00',
  comment: 'Personal? Ask MC.', author: 'anine', author_key: 'anine',
  status: 'open', decision: 'needs_info', tags: ['vat'], updated_at: '2026-08-21T08:30:00Z',
  row_dims: [], row_path: [], col_dims: [], col_path: 'Total',
  measure: 'amount', cell_value: null, filters: null, reply_count: 0, assignee_role: '',
};
const STALE_SEAT = {
  ...WITH_SEAT, id: 43, subject_label: 'Fuel · Jul 2026', comment: 'Split this.',
  assignee_role: 'jordyn',
};

function register() {
  return [{ ...WITH_SEAT }, { ...NO_SEAT, tags: [...NO_SEAT.tags] }, { ...STALE_SEAT }];
}

function mountPage() {
  return mount(AuditComments, { attachTo: document.body });
}

async function mounted() {
  const w = mountPage();
  await flushPromises();
  return w;
}

/** The params of the most recent register fetch. */
function lastQuery(): Record<string, unknown> {
  const calls = mocked.getAuditCubeComments.mock.calls;
  return calls[calls.length - 1][0];
}

function assigneeSelect(w: ReturnType<typeof mount>) {
  return w.find('[data-test="filter-assigned-to"]');
}

function optionValues(w: ReturnType<typeof mount>): string[] {
  return assigneeSelect(w).findAll('option').map((o) => o.attributes('value') ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  mockAuth.isAuditor = false;
  mockAuth.user = { username: 'mc', email: 'mc@tremly.com', role: 'standard' };
  peopleCalls.fn.mockResolvedValue({ count: DIRECTORY.length, results: DIRECTORY });
  mocked.getAuditCubeComments.mockImplementation(async () => ({ results: register() }));
});

afterEach(() => { document.body.innerHTML = ''; });

// ── The verdict control is gone ─────────────────────────────────────────────

describe('AuditComments — the verdict selector is not rendered', () => {
  it('renders no verdict <select> on ANY row, cube or bank', async () => {
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(3);
    expect(w.find('.cc__verdict select').exists()).toBe(false);
    // Not merely absent from that wrapper — absent from the card entirely.
    expect(w.findAll('article.cc select')).toHaveLength(0);
    w.unmount();
  });

  it('never calls setCommentDecision, however the page is exercised', async () => {
    const w = await mounted();
    // Everything a user can reach on a row: triage, and the filters.
    const buttons = w.findAll('article.cc button');
    for (const b of buttons) await b.trigger('click');
    await flushPromises();
    expect(mocked.setCommentDecision).not.toHaveBeenCalled();
    // And the /xero/data/ comments POST door is never opened for a read either.
    expect(mocked.getComments).not.toHaveBeenCalled();
    w.unmount();
  });

  it('keeps the read-only tags that lived beside it', async () => {
    const w = await mounted();
    expect(w.findAll('.cc__tag').map((t) => t.text())).toContain('vat');
    w.unmount();
  });

  it('keeps the verdict FILTER working — it reads data that exists', async () => {
    const w = await mounted();
    await w.find('[data-test="filter-verdict"]').setValue('needs_info');
    await flushPromises();
    expect(lastQuery()).toMatchObject({ decision: 'needs_info' });

    // "Undecided only" is the ABSENCE of a decision, so it stays client-side
    // rather than becoming an equality filter that can never match.
    await w.find('[data-test="filter-verdict"]').setValue('__none__');
    await flushPromises();
    expect(lastQuery().decision).toBeUndefined();
    expect(w.findAll('article.cc')).toHaveLength(2); // the bank row has one
    w.unmount();
  });
});

// ── Showing who a comment is with ───────────────────────────────────────────

describe('AuditComments — assignment is shown as a person, stored as a seat', () => {
  it('prints the person holding the seat, never the raw handle', async () => {
    const w = await mounted();
    const chip = w.find('[data-test="cc-assignee-41"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('Anzelle Vermaak');
    expect(chip.text()).not.toContain('bookkeeper');
    // The handle is still recoverable — it is what was actually stored.
    expect(chip.attributes('title')).toBe('Assigned to the bookkeeper seat');
    w.unmount();
  });

  it('shows nothing at all on an unassigned row', async () => {
    const w = await mounted();
    expect(w.find('[data-test="cc-assignee-42"]').exists()).toBe(false);
    w.unmount();
  });

  it('says so, in words, when the seat has been stood down', async () => {
    const w = await mounted();
    const chip = w.find('[data-test="cc-assignee-43"]');
    expect(chip.text()).toContain('Jordyn Wolhuter');
    expect(chip.text()).toContain('no longer active');
    // Colour is not the only carrier, but it is applied.
    expect(chip.classes()).toContain('cc__assignee--stale');
    w.unmount();
  });

  it('falls back to the bare handle for a seat the directory has never heard of', async () => {
    mocked.getAuditCubeComments.mockResolvedValue({
      results: [{ ...WITH_SEAT, assignee_role: 'ghost' }],
    });
    const w = await mounted();
    const chip = w.find('[data-test="cc-assignee-41"]');
    expect(chip.text()).toContain('ghost');
    // Unknown is NOT the same claim as stood-down, and must not be dressed as it.
    expect(chip.text()).not.toContain('no longer active');
    w.unmount();
  });

  it('renders the register even when the directory cannot be read', async () => {
    peopleCalls.fn.mockRejectedValue(new Error('network'));
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(3);
    expect(w.find('[data-test="cc-assignee-41"]').text()).toContain('bookkeeper');
    // A directory failure is not a register failure and must not be shown as one.
    expect(w.find('.k-alert').exists()).toBe(false);
    w.unmount();
  });
});

// ── The "Assigned to" filter ────────────────────────────────────────────────

describe('AuditComments — the "Assigned to" filter', () => {
  it('offers ACTIVE seats only — the stood-down one is never selectable', async () => {
    const w = await mounted();
    const values = optionValues(w);
    expect(values).toContain('bookkeeper');
    expect(values).toContain('auditor');
    expect(values).toContain('mc');
    expect(values).not.toContain('jordyn');
    expect(assigneeSelect(w).text()).not.toContain('Jordyn');
    w.unmount();
  });

  it('does not hard-code the seats — it fetches them', async () => {
    peopleCalls.fn.mockResolvedValue({
      count: 1,
      results: [{ id: 9, handle: 'newseat', display_name: 'Someone New', email: 'n@x.co', active: true }],
    });
    const w = await mounted();
    expect(peopleCalls.fn).toHaveBeenCalled();
    expect(optionValues(w)).toContain('newseat');
    expect(optionValues(w)).not.toContain('bookkeeper');
    w.unmount();
  });

  it('sends the HANDLE to the server when a seat is chosen', async () => {
    const w = await mounted();
    await assigneeSelect(w).setValue('bookkeeper');
    await flushPromises();
    expect(lastQuery()).toMatchObject({ assignee: 'bookkeeper' });
    w.unmount();
  });

  it('"assigned to me" resolves MY seat by EMAIL, the way the server resolves it', async () => {
    const w = await mounted();
    // The account's username is 'mc' and so is the handle, which would let a
    // guess-by-username implementation pass by accident. Drive it from an
    // account whose username does NOT match any handle.
    expect(optionValues(w)).toContain('__me__');
    await assigneeSelect(w).setValue('__me__');
    await flushPromises();
    expect(lastQuery()).toMatchObject({ assignee: 'mc' });
    w.unmount();
  });

  it('matches on email, not on username', async () => {
    mockAuth.user = { username: 'michael', email: 'mc@tremly.com', role: 'standard' };
    const w = await mounted();
    await assigneeSelect(w).setValue('__me__');
    await flushPromises();
    // 'michael' is not a handle; the email is what identifies the seat.
    expect(lastQuery()).toMatchObject({ assignee: 'mc' });
    w.unmount();
  });

  it('does not offer "assigned to me" to an account with no directory entry', async () => {
    mockAuth.user = { username: 'anzelle', email: 'nobody@nowhere.test', role: 'standard' };
    const w = await mounted();
    // Offering a filter that can only ever match nothing is worse than not
    // offering it — the server says the same thing about assigning to 'me'.
    expect(optionValues(w)).not.toContain('__me__');
    w.unmount();
  });

  it('"unassigned" is applied client-side — absence is not an equality filter', async () => {
    const w = await mounted();
    await assigneeSelect(w).setValue('__unassigned__');
    await flushPromises();
    expect(lastQuery().assignee).toBeUndefined();
    const cards = w.findAll('article.cc');
    expect(cards).toHaveLength(1);
    expect(cards[0].text()).toContain('Personal? Ask MC.');
    w.unmount();
  });

  it('"anyone" clears the filter rather than sending an empty one', async () => {
    const w = await mounted();
    await assigneeSelect(w).setValue('bookkeeper');
    await flushPromises();
    await assigneeSelect(w).setValue('');
    await flushPromises();
    expect(lastQuery().assignee).toBeUndefined();
    expect(w.findAll('article.cc')).toHaveLength(3);
    w.unmount();
  });

  it('an auditor can read assignment too — it is not a write control', async () => {
    mockAuth.isAuditor = true;
    mockAuth.user = { username: 'george', email: 'george@moore.co.za', role: 'auditor' };
    const w = await mounted();
    expect(w.find('[data-test="cc-assignee-41"]').text()).toContain('Anzelle Vermaak');
    expect(assigneeSelect(w).exists()).toBe(true);
    w.unmount();
  });
});

// ── Nothing here writes ─────────────────────────────────────────────────────

describe('AuditComments — assignment is read-only until there is a by-id endpoint', () => {
  it('offers no control that would POST an assignment', async () => {
    const w = await mounted();
    // No per-row picker. Assignment can only be written today through the
    // upserts keyed on the REQUESTER's author_key, which would fork every row
    // in this register (its authors are 'MC (To Review)', 'anine', agents —
    // none of them a console username) instead of routing it.
    expect(w.findAll('article.cc select')).toHaveLength(0);
    expect(w.findAll('article.cc input')).toHaveLength(0);
    const labels = w.findAll('article.cc button').map((b) => b.text().toLowerCase());
    expect(labels.some((t) => t.includes('assign'))).toBe(false);
    // And no bulk bar, for the same reason.
    expect(w.text().toLowerCase()).not.toContain('assign selected');
    w.unmount();
  });
});
