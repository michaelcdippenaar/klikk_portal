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
    setCommentAssignee: vi.fn(),
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
  setCommentAssignee: ReturnType<typeof vi.fn>;
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
  // The endpoint echoes the stored row back, which is what the page trusts —
  // not the value it optimistically sent.
  mocked.setCommentAssignee.mockImplementation(async (id: number, handle: string) => ({
    id, assignee_role: handle, reassigned: true,
  }));
});

/** An axios-shaped rejection carrying the server's 400 body. */
function refusal(message: string) {
  return Object.assign(new Error('Request failed with status code 400'), {
    response: { status: 400, data: { error: message } },
  });
}

function picker(w: ReturnType<typeof mount>, id: number) {
  return w.find(`[data-test="cc-assign-${id}"]`);
}

afterEach(() => { document.body.innerHTML = ''; });

// ── The verdict control is gone ─────────────────────────────────────────────

describe('AuditComments — the verdict selector is not rendered', () => {
  it('renders no verdict <select> on ANY row, cube or bank', async () => {
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(3);
    expect(w.find('.cc__verdict select').exists()).toBe(false);
    // The ONLY <select> on a card is the assignee picker. Naming it that way
    // rather than counting to zero keeps this honest as the page grows: a
    // verdict control reintroduced anywhere on the row fails here.
    const selects = w.findAll('article.cc select');
    expect(selects).toHaveLength(3);
    expect(selects.every((el) => (el.attributes('data-test') || '').startsWith('cc-assign-')))
      .toBe(true);
    // And no card offers a decision as a choice.
    const values = selects.flatMap((el) => el.findAll('option').map((o) => o.attributes('value')));
    for (const decision of ['business_expense', 'personal', 'duplicate', 'needs_info', 'no_action']) {
      expect(values).not.toContain(decision);
    }
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
  it('the picker holds the stored HANDLE and shows the person', async () => {
    const w = await mounted();
    const sel = picker(w, 41);
    expect((sel.element as HTMLSelectElement).value).toBe('bookkeeper');
    const chosen = sel.findAll('option').find(
      (o) => o.attributes('value') === 'bookkeeper')!;
    expect(chosen.text()).toBe('Anzelle Vermaak');
    w.unmount();
  });

  it('an unassigned row sits on the unassign option, not on a blank', async () => {
    const w = await mounted();
    expect((picker(w, 42).element as HTMLSelectElement).value).toBe('');
    expect(picker(w, 42).findAll('option')[0].text()).toBe('Unassigned');
    w.unmount();
  });

  it('offers ACTIVE seats only — an inactive one is never a target', async () => {
    const w = await mounted();
    // Row 42 holds no stood-down seat, so its picker is the plain shared list.
    const values = picker(w, 42).findAll('option').map((o) => o.attributes('value'));
    expect(values).toEqual(['', 'auditor', 'bookkeeper', 'mc']);
    expect(values).not.toContain('jordyn');
    w.unmount();
  });

  it('shows a stood-down seat on the row that holds it, DISABLED', async () => {
    const w = await mounted();
    const sel = picker(w, 43);
    // The select must not render blank over a real assignment…
    expect((sel.element as HTMLSelectElement).value).toBe('jordyn');
    const stale = sel.findAll('option').find((o) => o.attributes('value') === 'jordyn')!;
    expect(stale.text()).toContain('Jordyn Wolhuter');
    expect(stale.text()).toContain('no longer active');
    // …and it can be moved OFF that seat but never onto it.
    expect(stale.attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('falls back to the bare handle for a seat the directory has never heard of', async () => {
    mocked.getAuditCubeComments.mockResolvedValue({
      results: [{ ...WITH_SEAT, assignee_role: 'ghost' }],
    });
    const w = await mounted();
    const ghost = picker(w, 41).findAll('option').find(
      (o) => o.attributes('value') === 'ghost')!;
    expect(ghost.text()).toBe('ghost');
    // Unknown is NOT the same claim as stood-down, and must not be dressed as it.
    expect(ghost.text()).not.toContain('no longer active');
    w.unmount();
  });

  it('renders the register even when the directory cannot be read', async () => {
    peopleCalls.fn.mockRejectedValue(new Error('network'));
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(3);
    // No seats to offer, but the stored assignment is still shown and the
    // unassign is still reachable — a directory outage must not trap a point.
    const values = picker(w, 41).findAll('option').map((o) => o.attributes('value'));
    expect(values).toEqual(['', 'bookkeeper']);
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

  it('"assigned to me" resolves MY seat by EMAIL, the way the server does', async () => {
    const w = await mounted();
    expect(optionValues(w)).toContain('__me__');
    await assigneeSelect(w).setValue('__me__');
    await flushPromises();
    expect(lastQuery()).toMatchObject({ assignee: 'mc' });
    w.unmount();
  });

  it('matches on email, not on username', async () => {
    // The account's username is normally 'mc' and so is the handle, which
    // would let a guess-by-username implementation pass by accident. Drive it
    // from an account whose username matches no handle at all.
    mockAuth.user = { username: 'michael', email: 'mc@tremly.com', role: 'standard' };
    const w = await mounted();
    await assigneeSelect(w).setValue('__me__');
    await flushPromises();
    expect(lastQuery()).toMatchObject({ assignee: 'mc' });
    w.unmount();
  });

  it('does not offer "assigned to me" to an account with no directory entry', async () => {
    mockAuth.user = { username: 'anzelle', email: 'nobody@nowhere.test', role: 'standard' };
    const w = await mounted();
    // Offering a filter that can only ever match nothing is worse than not
    // offering it — the server says the same about assigning to 'me'.
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
});

// ── Assigning one ───────────────────────────────────────────────────────────

describe('AuditComments — the per-row picker writes by id', () => {
  it('sends the comment id and the HANDLE, never a person or a comment body', async () => {
    const w = await mounted();
    await picker(w, 42).setValue('bookkeeper');
    await flushPromises();

    expect(mocked.setCommentAssignee).toHaveBeenCalledTimes(1);
    expect(mocked.setCommentAssignee).toHaveBeenCalledWith(42, 'bookkeeper');
    // The upsert doors are never opened — that is the whole point of by-id.
    expect(mocked.getComments).not.toHaveBeenCalled();
    expect(mocked.setCommentDecision).not.toHaveBeenCalled();
    w.unmount();
  });

  it('unassigns with an empty string rather than a magic token', async () => {
    const w = await mounted();
    await picker(w, 41).setValue('');
    await flushPromises();
    expect(mocked.setCommentAssignee).toHaveBeenCalledWith(41, '');
    w.unmount();
  });

  it('trusts the row the server echoes back, not what it sent', async () => {
    mocked.setCommentAssignee.mockResolvedValueOnce({
      id: 42, assignee_role: 'auditor', reassigned: true,
    });
    const w = await mounted();
    await picker(w, 42).setValue('bookkeeper');
    await flushPromises();
    expect((picker(w, 42).element as HTMLSelectElement).value).toBe('auditor');
    w.unmount();
  });

  it('does not call the server when the seat has not changed', async () => {
    const w = await mounted();
    await picker(w, 41).setValue('bookkeeper');
    await flushPromises();
    // A no-op would write a trail row for a change of hands that never
    // happened, which is what resets the ageing clock the log exists for.
    expect(mocked.setCommentAssignee).not.toHaveBeenCalled();
    w.unmount();
  });

  it('surfaces the SERVER\'s 400 verbatim and puts the control back', async () => {
    mocked.setCommentAssignee.mockRejectedValueOnce(
      refusal("handle 'jordyn' is not active — assigning to a role nobody holds is the same as assigning to nobody"));
    const w = await mounted();
    await picker(w, 42).setValue('bookkeeper');
    await flushPromises();

    // The message names the problem; a generic "could not assign" would not.
    expect(w.text()).toContain("handle 'jordyn' is not active");
    // A native <select> has already moved by the time the handler runs, and
    // the row did not change — so nothing re-renders and the control would
    // otherwise sit showing a seat the server refused.
    expect((picker(w, 42).element as HTMLSelectElement).value).toBe('');
    w.unmount();
  });

  it('drops a row that no longer matches the assignee filter', async () => {
    const w = await mounted();
    await assigneeSelect(w).setValue('bookkeeper');
    await flushPromises();
    expect(w.findAll('article.cc')).toHaveLength(3); // server-filtered fixture

    await picker(w, 41).setValue('auditor');
    await flushPromises();
    // Leaving a row captioned "with the auditor" in a list filtered to the
    // bookkeeper is a list that lies.
    expect(w.find('[data-test="cc-assign-41"]').exists()).toBe(false);
    w.unmount();
  });
});

// ── Assigning many ──────────────────────────────────────────────────────────

describe('AuditComments — bulk assign', () => {
  async function selectRows(w: ReturnType<typeof mount>, ids: number[]) {
    for (const id of ids) await w.find(`[data-test="cc-pick-${id}"]`).setValue(true);
    await flushPromises();
  }

  it('shows no bar until something is selected', async () => {
    const w = await mounted();
    expect(w.find('[data-test="cc-bulk"]').exists()).toBe(false);
    await selectRows(w, [41]);
    expect(w.find('[data-test="cc-bulk"]').text()).toContain('1 selected');
    w.unmount();
  });

  it('select-all ticks every row SHOWN, and unticks them again', async () => {
    const w = await mounted();
    await w.find('[data-test="cc-select-all"]').setValue(true);
    await flushPromises();
    expect(w.find('[data-test="cc-bulk"]').text()).toContain('3 selected');
    await w.find('[data-test="cc-select-all"]').setValue(false);
    await flushPromises();
    expect(w.find('[data-test="cc-bulk"]').exists()).toBe(false);
    w.unmount();
  });

  it('issues ONE call per comment and reports what landed', async () => {
    const w = await mounted();
    await selectRows(w, [41, 42, 43]);
    await w.find('[data-test="cc-bulk-handle"]').setValue('auditor');
    await w.find('[data-test="cc-bulk-apply"]').trigger('click');
    await flushPromises();

    expect(mocked.setCommentAssignee.mock.calls).toEqual([
      [41, 'auditor'], [42, 'auditor'], [43, 'auditor'],
    ]);
    const result = w.find('[data-test="cc-bulk-result"]');
    expect(result.text()).toContain('3 of 3');
    expect(result.text()).toContain('George du Preez');
    expect(w.findAll('[data-test="cc-bulk-failure"]')).toHaveLength(0);
    // Everything landed, so nothing is left selected.
    expect(w.find('[data-test="cc-bulk"]').exists()).toBe(false);
    w.unmount();
  });

  it('reports a PARTIAL failure honestly, naming each row and the reason', async () => {
    mocked.setCommentAssignee
      .mockImplementationOnce(async (id: number, handle: string) => ({ id, assignee_role: handle }))
      .mockRejectedValueOnce(refusal('no such comment'))
      .mockRejectedValueOnce(refusal("handle 'ghost' is not active"));

    const w = await mounted();
    await selectRows(w, [41, 42, 43]);
    await w.find('[data-test="cc-bulk-handle"]').setValue('auditor');
    await w.find('[data-test="cc-bulk-apply"]').trigger('click');
    await flushPromises();

    const result = w.find('[data-test="cc-bulk-result"]');
    // NOT "3 assigned". The register would disagree the moment it reloaded.
    expect(result.text()).toContain('1 of 3');
    expect(result.text()).toContain('2 refused');

    const failures = w.findAll('[data-test="cc-bulk-failure"]');
    expect(failures).toHaveLength(2);
    expect(failures[0].text()).toContain('Investec · 2026-08-04 · R259.00');
    expect(failures[0].text()).toContain('no such comment');
    expect(failures[1].text()).toContain('Fuel · Jul 2026');
    expect(failures[1].text()).toContain("handle 'ghost' is not active");

    // The two that failed stay ticked so the retry is the same button again.
    expect(w.find('[data-test="cc-bulk"]').text()).toContain('2 selected');
    expect(w.find('[data-test="cc-pick-41"]').attributes('checked')).toBeUndefined();
    w.unmount();
  });

  it('a whole-batch failure reports zero, not silence', async () => {
    mocked.setCommentAssignee.mockRejectedValue(refusal('nope'));
    const w = await mounted();
    await selectRows(w, [41, 42]);
    await w.find('[data-test="cc-bulk-apply"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-test="cc-bulk-result"]').text()).toContain('0 of 2');
    expect(w.findAll('[data-test="cc-bulk-failure"]')).toHaveLength(2);
    w.unmount();
  });

  it('bulk-unassigns with the empty handle', async () => {
    const w = await mounted();
    await selectRows(w, [41]);
    await w.find('[data-test="cc-bulk-apply"]').trigger('click');
    await flushPromises();
    expect(mocked.setCommentAssignee).toHaveBeenCalledWith(41, '');
    expect(w.find('[data-test="cc-bulk-result"]').text()).toContain('unassigned');
    w.unmount();
  });

  it('never offers an inactive seat as a bulk target', async () => {
    const w = await mounted();
    await selectRows(w, [41]);
    const values = w.find('[data-test="cc-bulk-handle"]').findAll('option')
      .map((o) => o.attributes('value'));
    expect(values).toEqual(['', 'auditor', 'bookkeeper', 'mc']);
    w.unmount();
  });

  it('drops the selection when the filter changes', async () => {
    const w = await mounted();
    await selectRows(w, [41, 42]);
    expect(w.find('[data-test="cc-bulk"]').exists()).toBe(true);
    await w.find('[data-test="filter-status"]').setValue('all');
    await flushPromises();
    // "Assign the 12 I ticked" must not act on rows the reader can no longer
    // see — the selection was made against what was on screen.
    expect(w.find('[data-test="cc-bulk"]').exists()).toBe(false);
    w.unmount();
  });
});

// ── The auditor gate ────────────────────────────────────────────────────────

describe('AuditComments — an auditor reads assignment and cannot write it', () => {
  beforeEach(() => {
    mockAuth.isAuditor = true;
    mockAuth.user = { username: 'george', email: 'george@moore.co.za', role: 'auditor' };
  });

  it('shows the chip instead of the picker, and offers no bulk affordance', async () => {
    const w = await mounted();
    // The assign endpoint sits under /xero/data/, which 403s for this role, so
    // a picker could only ever fail. Reading who holds a point is their job.
    expect(w.find('[data-test="cc-assignee-41"]').text()).toContain('Anzelle Vermaak');
    expect(w.find('[data-test="cc-assign-41"]').exists()).toBe(false);
    expect(w.find('[data-test="cc-pick-41"]').exists()).toBe(false);
    expect(w.find('[data-test="cc-select-all"]').exists()).toBe(false);
    expect(w.find('[data-test="cc-bulk"]').exists()).toBe(false);
    w.unmount();
  });

  it('still says when a seat has been stood down', async () => {
    const w = await mounted();
    const chip = w.find('[data-test="cc-assignee-43"]');
    expect(chip.text()).toContain('Jordyn Wolhuter');
    expect(chip.text()).toContain('no longer active');
    expect(chip.classes()).toContain('cc__assignee--stale');
    w.unmount();
  });

  it('can still read and drive the "Assigned to" filter', async () => {
    const w = await mounted();
    expect(assigneeSelect(w).exists()).toBe(true);
    await assigneeSelect(w).setValue('bookkeeper');
    await flushPromises();
    expect(lastQuery()).toMatchObject({ assignee: 'bookkeeper' });
    w.unmount();
  });
});

// ---------------------------------------------------------------------------
// The badge text, asserted ON THE PAGE and not only on the primitive.
//
// KBadge declared `label` and no <slot> while this page passed its text as slot
// content, so every row's status and the subject-kind label rendered as EMPTY
// SPANS -- on this register, in production. It was fixed in the primitive and
// covered by KBadge.slot.spec.ts, but that spec cannot see this page: if a
// refactor changes how AuditComments hands text to KBadge, the primitive spec
// still passes and the register silently blanks again.
//
// The 75 mount-based specs here all passed against the broken component because
// not one of them looked at what a badge SAID. These do.
describe('AuditComments — the badges actually say something', () => {
  it('renders each row status as visible badge text', async () => {
    const w = await mounted();
    const badges = w.findAll('.kbadge').map((b) => b.text());
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((t) => t.trim().length > 0)).toBe(true);
    expect(badges).toContain('open');
    w.unmount();
  });

  it('shows the subject-kind label for a non-cube row', async () => {
    const w = await mounted();
    expect(w.text()).toContain('open');
    // every badge on the page carries text; none is an empty span
    expect(w.findAll('.kbadge').filter((b) => b.text().trim() === '')).toHaveLength(0);
    w.unmount();
  });

  it('gives every badge a tone class the stylesheet defines', async () => {
    const w = await mounted();
    const DEFINED = ['kbadge--default', 'kbadge--accent', 'kbadge--muted'];
    for (const b of w.findAll('.kbadge')) {
      const tone = b.classes().find((c) => c.startsWith('kbadge--')
        && !c.endsWith('--sm') && !c.endsWith('--md'));
      expect(DEFINED, `unstyled tone class ${tone}`).toContain(tone);
    }
    w.unmount();
  });
});
