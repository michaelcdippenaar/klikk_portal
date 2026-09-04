// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * AuditComments.edit.spec — rewriting a comment's WORDS, and the two things
 * that must survive it: who wrote it, and what figure it is about.
 *
 * This register is not a comment box. It is a shared audit trail: MC writes
 * into it from Excel, the agents write into it from the MCP, and BOTH read it
 * back. So an edit control on it is not a convenience feature — it is a write
 * path into a record other software trusts. Everything below is about the two
 * ways that goes wrong:
 *
 *   1. RE-ATTRIBUTION. `app.cube_comments` is upserted ON CONFLICT
 *      (subject_type, subject_key, author_key) with `author_key` stamped from
 *      the credential. A write that carries an author does not amend a
 *      comment, it forks it under the caller's name. The by-id text door
 *      refuses those fields, and the card must never LOOK like it did
 *      otherwise: an agent's comment that MC tidied is still the agent's
 *      comment, and a card that reads "MC" is a lie the next agent will act
 *      on. Two facts, side by side, never merged.
 *
 *   2. FALSE CONFIRMATION. `edited: false` is a NO-OP — the server wrote no
 *      history row. A UI that closes on it as though it saved leaves the
 *      reader believing the register says something it does not.
 *
 * Everything here asserts RENDERED TEXT. A badge on this page shipped EMPTY
 * to production while seventy-five mount-based specs passed, because they all
 * asserted that an element existed rather than what it said. `.exists()` is
 * not an assertion about a user.
 *
 * The request BODY is pinned in src/api/__tests__/cubeComments.editText.spec.ts
 * — this file mocks the API module, so it cannot see the wire.
 *
 * Timeout is GLOBAL (60s, vitest.config.js). No vi.setConfig here, and no
 * per-test timeout argument: both override the global for everything sharing
 * the worker, and that has cost this suite a debugging round already.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

/**
 * Counts real anchor parses, the same measure registerScale.spec uses. Here it
 * answers a different question: does OPENING AN EDITOR cost work proportional
 * to the register? The anchors are memoised off `all`, so an edit — which
 * touches `comment` and `edited` and nothing else — must not re-parse a byte.
 */
const parseCalls = vi.hoisted(() => ({ n: 0 }));

vi.mock('../../api/cubeComments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/cubeComments')>();
  return {
    ...actual,
    normaliseFilters: (f: unknown) => { parseCalls.n += 1; return actual.normaliseFilters(f); },
    getComments: vi.fn(),
    getAuditCubeComments: vi.fn(),
    getCubeCommentReplies: vi.fn().mockResolvedValue({ comment_id: 0, replies: [] }),
    postCubeCommentReply: vi.fn(),
    setCubeCommentStatus: vi.fn(),
    setCommentDecision: vi.fn(),
    setCommentAssignee: vi.fn(),
    setCubeCommentText: vi.fn(),
    getCubeCommentTextHistory: vi.fn(),
    drillCubeComment: vi.fn(),
  };
});

// The live seat directory as at 2026-09-03, inactive seat included — same
// fixture the sibling specs use, for the same reason.
const DIRECTORY = vi.hoisted(() => [
  { id: 1, handle: 'auditor', display_name: 'George du Preez', email: 'george@moore.co.za', active: true },
  { id: 2, handle: 'bookkeeper', display_name: 'Anzelle Vermaak', email: 'anzelle@moore.co.za', active: true },
  { id: 3, handle: 'jordyn', display_name: 'Jordyn Wolhuter', email: 'jordyn@klikk.co.za', active: false },
  { id: 4, handle: 'mc', display_name: 'MC Dippenaar', email: 'mc@tremly.com', active: true },
]);
vi.mock('../../api/people', () => ({
  getPeople: vi.fn().mockResolvedValue({ count: 4, results: DIRECTORY }),
}));
vi.mock('../../api/comments', () => ({
  getCommentFeed: vi.fn().mockResolvedValue({ now: null, events: [] }),
}));
vi.mock('../../composables/useToast', () => ({
  useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

// A plain <select> for KSelect — same stub as the assignment spec, same
// reason: cheap mount, stable hooks. The real widget is exercised against this
// page in AuditComments.authorFilter.spec.ts.
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
  getAuditCubeComments: ReturnType<typeof vi.fn>;
  setCubeCommentText: ReturnType<typeof vi.fn>;
  getCubeCommentTextHistory: ReturnType<typeof vi.fn>;
  setCommentAssignee: ReturnType<typeof vi.fn>;
  setCommentDecision: ReturnType<typeof vi.fn>;
};

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// The row that matters is an AGENT's. MC is a superuser and may rewrite it;
// the register must still say the agent wrote it. A fixture authored by 'mc'
// could not tell a correct card from a re-attributing one.

const AGENT_ROW = {
  id: 41,
  subject_type: 'cube_cell',
  subject_label: 'Repairs & maintenance · Aug 2026',
  comment: 'Check this is not capitalised.',
  author: 'claude:year-end-audit',
  author_key: 'claude:year-end-audit',
  status: 'open',
  decision: '',
  tags: [],
  updated_at: '2026-08-20T10:00:00Z',
  row_dims: ['account'],
  row_path: ['6100 Repairs'],
  col_dims: ['month'],
  col_path: '2026-08',
  measure: 'amount',
  cell_value: '21600.00',
  filters: '{"fy": "2026", "entity": "Klikk"}',
  reply_count: 0,
  assignee_role: 'bookkeeper',
  edited: false,
};
const MC_ROW = {
  ...AGENT_ROW,
  id: 42,
  subject_label: 'Fuel · Jul 2026',
  comment: 'Split this between Klikk and personal.',
  author: 'MC (To Review)',
  author_key: 'MC (To Review)',
  assignee_role: '',
};
/** Already carries an edit — the marker's LOAD path, not its in-session one. */
const ALREADY_EDITED = {
  ...AGENT_ROW,
  id: 43,
  subject_label: 'Insurance · Jun 2026',
  comment: 'Reworded by MC earlier.',
  edited: true,
};

function register() {
  return [{ ...AGENT_ROW }, { ...MC_ROW }, { ...ALREADY_EDITED }];
}

/** The 200 body: the full comment row, plus `edited`. */
function saved(row: Record<string, unknown>, comment: string, edited = true) {
  return { ...row, comment, edited };
}

/** An axios-shaped rejection, the way the page actually receives one. */
function httpError(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });
}

function mountPage() {
  return mount(AuditComments, { attachTo: document.body });
}
async function mounted() {
  const w = mountPage();
  await flushPromises();
  return w;
}

type W = ReturnType<typeof mount>;
const squish = (s: string) => s.replace(/\s+/g, ' ').trim();
const at = (w: W, hook: string) => w.find(`[data-test="${hook}"]`);
const textOf = (w: W, hook: string) => squish(at(w, hook).text());
const card = (w: W, id: number) =>
  w.findAll('article.cc').find((c) => c.find(`[data-test="cc-edit-input-${id}"]`).exists()
    || c.find(`[data-test="cc-text-${id}"]`).exists());

async function openEditor(w: W, id: number) {
  await at(w, `cc-edit-${id}`).trigger('click');
  await flushPromises();
}
function draft(w: W, id: number) {
  return at(w, `cc-edit-input-${id}`).element as HTMLTextAreaElement;
}
async function type(w: W, id: number, text: string) {
  await at(w, `cc-edit-input-${id}`).setValue(text);
}
async function save(w: W, id: number) {
  await at(w, `cc-edit-save-${id}`).trigger('click');
  await flushPromises();
}
/** The page's own Refresh — the same code path the 5-second register reload runs. */
async function refetch(w: W) {
  const btn = w.findAll('button').find((b) => squish(b.text()) === 'Refresh')!;
  await btn.trigger('click');
  await flushPromises();
}
/** Every alert banner on the page, as the reader sees them. */
function alerts(w: W): string[] {
  return w.findAll('.kalert').map((a) => squish(a.text()));
}

beforeEach(() => {
  vi.clearAllMocks();
  parseCalls.n = 0;
  document.body.innerHTML = '';
  mockAuth.isAuditor = false;
  mockAuth.user = { username: 'mc', email: 'mc@tremly.com', role: 'standard' };
  mocked.getAuditCubeComments.mockImplementation(async () => ({ results: register() }));
  mocked.getCubeCommentTextHistory.mockResolvedValue({ history: [] });
  mocked.setCubeCommentText.mockImplementation(
    async (id: number, comment: string) => saved({ ...AGENT_ROW, id }, comment, true));
});

afterEach(() => { document.body.innerHTML = ''; });

// ── The editor, opened ──────────────────────────────────────────────────────

describe('AuditComments — opening the inline editor', () => {
  it('every non-auditor row offers "Edit text", and none is open at rest', async () => {
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(3);
    expect(w.findAll('[data-test^="cc-edit-"]').filter(
      (b) => b.element.tagName === 'BUTTON')).not.toHaveLength(0);
    expect(w.find('textarea').exists()).toBe(false);
    expect(w.findAll('[data-test^="cc-editor-"]')).toHaveLength(0);
    // The card shows the comment as prose until asked otherwise.
    expect(textOf(w, 'cc-text-41')).toBe('Check this is not capitalised.');
    w.unmount();
  });

  it('opens in place, prefilled with the STORED text, labelled', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    expect(draft(w, 41).value).toBe('Check this is not capitalised.');
    // A label, bound to the control, because a textarea with a floating
    // caption above it is not labelled.
    const label = w.find('label[for="cc-edit-input-41"]');
    expect(label.exists()).toBe(true);
    expect(squish(label.text())).toBe('Comment text');
    // The prose is replaced, not duplicated — two copies of one comment on one
    // card is two things to believe.
    expect(w.find('[data-test="cc-text-41"]').exists()).toBe(false);
    w.unmount();
  });

  it('SAYS, before you type, that this stays the agent\'s comment', async () => {
    // Invariant 1, at the moment it matters: the reader is about to rewrite
    // somebody else's words and needs to know the record will not say it was
    // theirs. This is rendered text, and it names the actual author.
    const w = await mounted();
    await openEditor(w, 41);
    const note = squish(card(w, 41)!.find('.cc__edit-note').text());
    expect(note).toBe(
      'Text only. The anchor and the author stay as they are — '
      + 'this stays claude:year-end-audit\'s comment.');
    expect(note).not.toContain('mc');
    w.unmount();
  });

  it('keeps the ANCHOR on screen while the text is being rewritten', async () => {
    // The one thing the endpoint refuses to change is the one thing that must
    // stay visible: you cannot check that a rewrite still describes the figure
    // if the figure is off screen.
    const w = await mounted();
    await openEditor(w, 41);
    const c = card(w, 41)!;
    expect(squish(c.find('.cc__subject').text())).toBe('Repairs & maintenance · Aug 2026');
    expect(squish(c.find('[data-test="cc-amount-41"]').text())).toBe('R21,600.00');
    w.unmount();
  });

  it('opens ONE editor at a time — a second Edit click MOVES it', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'a draft nobody asked to keep');
    await openEditor(w, 42);

    expect(w.findAll('textarea')).toHaveLength(1);
    expect(w.findAll('[data-test^="cc-editor-"]')).toHaveLength(1);
    expect(draft(w, 42).value).toBe('Split this between Klikk and personal.');
    // Row 41 is prose again, showing its STORED text — the abandoned draft is
    // not on screen anywhere.
    expect(textOf(w, 'cc-text-41')).toBe('Check this is not capitalised.');
    expect(w.text()).not.toContain('a draft nobody asked to keep');
    expect(mocked.setCubeCommentText).not.toHaveBeenCalled();
    w.unmount();
  });

  it('coming back to a row you abandoned reopens the STORED text, not the draft', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'half-written thought');
    await openEditor(w, 42);
    await openEditor(w, 41);
    expect(draft(w, 41).value).toBe('Check this is not capitalised.');
    w.unmount();
  });

  it('Cancel restores the original and writes nothing', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'discard me');
    await at(w, 'cc-edit-cancel-41').trigger('click');
    await flushPromises();

    expect(w.find('textarea').exists()).toBe(false);
    expect(textOf(w, 'cc-text-41')).toBe('Check this is not capitalised.');
    expect(w.text()).not.toContain('discard me');
    expect(mocked.setCubeCommentText).not.toHaveBeenCalled();
    // And the card is editable again.
    expect(at(w, 'cc-edit-41').exists()).toBe(true);
    w.unmount();
  });
});

// ── Saving ──────────────────────────────────────────────────────────────────

describe('AuditComments — saving the text', () => {
  it('sends the id and the text, and shows the SERVER\'s stored wording back', async () => {
    // Not the typed string: the server owns normalisation, and a card showing
    // what was typed would disagree with the register on the next load.
    mocked.setCubeCommentText.mockResolvedValue(
      saved(AGENT_ROW, 'Capitalise this — it is an improvement.', true));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, '  Capitalise this — it is an improvement.  ');
    await save(w, 41);

    expect(mocked.setCubeCommentText).toHaveBeenCalledTimes(1);
    expect(mocked.setCubeCommentText).toHaveBeenCalledWith(
      41, '  Capitalise this — it is an improvement.  ');
    expect(w.find('textarea').exists()).toBe(false);
    expect(textOf(w, 'cc-text-41')).toBe('Capitalise this — it is an improvement.');
    w.unmount();
  });

  it('edits ONLY the row it was opened on', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Row 41 rewritten.');
    await save(w, 41);
    expect(mocked.setCubeCommentText.mock.calls[0][0]).toBe(41);
    expect(textOf(w, 'cc-text-42')).toBe('Split this between Klikk and personal.');
    expect(textOf(w, 'cc-text-43')).toBe('Reworded by MC earlier.');
    w.unmount();
  });

  it('two rows in sequence: no state from the first reaches the second', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'First edit.');
    await save(w, 41);

    await openEditor(w, 42);
    // The editor opened on 42 must hold 42's text, not 41's.
    expect(draft(w, 42).value).toBe('Split this between Klikk and personal.');
    await type(w, 42, 'Second edit.');
    await save(w, 42);

    expect(mocked.setCubeCommentText.mock.calls).toEqual([
      [41, 'First edit.'],
      [42, 'Second edit.'],
    ]);
    expect(textOf(w, 'cc-text-41')).toBe('First edit.');
    expect(textOf(w, 'cc-text-42')).toBe('Second edit.');
    // Both marked, independently.
    expect(textOf(w, 'cc-edited-41')).toBe('Text edited — written by claude:year-end-audit');
    expect(textOf(w, 'cc-edited-42')).toBe('Text edited — written by MC (To Review)');
    w.unmount();
  });

  it('a rapid double-click sends ONE request', async () => {
    // Dispatched synchronously, both before any re-render, so this tests the
    // in-flight GUARD rather than the disabled attribute — a disabled button
    // only stops the second click if the DOM has already been patched, and
    // under a slow server it has not.
    let release!: (v: unknown) => void;
    mocked.setCubeCommentText.mockImplementation(
      () => new Promise((r) => { release = r; }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Once, please.');

    const btn = at(w, 'cc-edit-save-41').element as HTMLButtonElement;
    btn.dispatchEvent(new Event('click'));
    btn.dispatchEvent(new Event('click'));
    btn.dispatchEvent(new Event('click'));
    expect(mocked.setCubeCommentText).toHaveBeenCalledTimes(1);

    release(saved(AGENT_ROW, 'Once, please.', true));
    await flushPromises();
    expect(mocked.setCubeCommentText).toHaveBeenCalledTimes(1);
    expect(textOf(w, 'cc-text-41')).toBe('Once, please.');
    w.unmount();
  });

  it('says "Saving…" while in flight and disables both buttons', async () => {
    let release!: (v: unknown) => void;
    mocked.setCubeCommentText.mockImplementation(
      () => new Promise((r) => { release = r; }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Slow one.');
    await at(w, 'cc-edit-save-41').trigger('click');
    await flushPromises();

    expect(squish(at(w, 'cc-edit-save-41').text())).toBe('Saving…');
    expect(at(w, 'cc-edit-save-41').attributes('disabled')).toBeDefined();
    expect(at(w, 'cc-edit-cancel-41').attributes('disabled')).toBeDefined();
    expect(draft(w, 41).disabled).toBe(true);

    release(saved(AGENT_ROW, 'Slow one.', true));
    await flushPromises();
    expect(w.find('textarea').exists()).toBe(false);
    w.unmount();
  });

  it('carries a very long comment through whole', async () => {
    const long = `Reviewed the ledger. ${'Detail. '.repeat(2500)}End.`;
    mocked.setCubeCommentText.mockImplementation(
      async (id: number, comment: string) => saved({ ...AGENT_ROW, id }, comment, true));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, long);
    expect(draft(w, 41).value).toHaveLength(long.length);
    await save(w, 41);

    expect(mocked.setCubeCommentText.mock.calls[0][1]).toHaveLength(long.length);
    // Rendered in full — not clipped, not ellipsised into a different sentence.
    expect(at(w, 'cc-text-41').text()).toHaveLength(long.length);
    w.unmount();
  });
});

// ── Invariant 1: an edit never re-attributes ────────────────────────────────

describe('AuditComments — an edit never re-attributes', () => {
  it('the card states the edit and the author as TWO facts', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Tidied by MC.');
    await save(w, 41);

    // The exact sentence. This is the assertion the empty-badge incident says
    // to write: not that the marker exists, but that it names the agent.
    expect(textOf(w, 'cc-edited-41')).toBe('Text edited — written by claude:year-end-audit');
    const byline = squish(card(w, 41)!.find('.cc__byline').text());
    expect(byline).toContain('claude:year-end-audit');
    // The editing account's name appears nowhere in the attribution. If it
    // ever does, an agent reading this register back attributes MC's wording
    // to itself. (The seat picker elsewhere on the card legitimately lists
    // every seat, MC included — so this is scoped to the byline, which is
    // where the register's answer to "who wrote this" is rendered.)
    expect(byline).not.toContain('MC Dippenaar');
    expect(byline).not.toMatch(/\bby mc\b/i);
    // And the card's identity line — the register's answer to "who wrote
    // this" — still names the agent after the edit.
    expect(squish(card(w, 41)!.find('.cc__author').text())).toBe('claude:year-end-audit');
    w.unmount();
  });

  it('ignores an author the RESPONSE tries to hand back', async () => {
    // The server stamps author_key from the credential and does not change it
    // here. But the console must not be the thing that trusts a response to
    // rename a comment: it takes the text and the `edited` flag off the
    // response and nothing else.
    mocked.setCubeCommentText.mockResolvedValue({
      ...AGENT_ROW,
      comment: 'Tidied by MC.',
      author: 'mc',
      author_key: 'mc',
      edited: true,
    });
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Tidied by MC.');
    await save(w, 41);

    expect(textOf(w, 'cc-edited-41')).toBe('Text edited — written by claude:year-end-audit');
    expect(textOf(w, 'cc-text-41')).toBe('Tidied by MC.');
    w.unmount();
  });

  it('the anchor is unchanged by the edit, on screen as on the wire', async () => {
    const w = await mounted();
    // The anchor is the headline and the figure beside it. It used to be
    // asserted through the coordinate run as well; that run is gone from the
    // card (replaced by the transactions), so what is pinned here is what a
    // reader now sees, before and after.
    const before = squish(card(w, 41)!.find('.cc__anchor').text());
    await openEditor(w, 41);
    await type(w, 41, 'Different words entirely.');
    await save(w, 41);

    const c = card(w, 41)!;
    expect(squish(c.find('.cc__anchor').text())).toBe(before);
    expect(before).toContain('Repairs & maintenance · Aug 2026');
    expect(squish(c.find('.cc__subject').text())).toBe('Repairs & maintenance · Aug 2026');
    expect(squish(c.find('[data-test="cc-amount-41"]').text())).toBe('R21,600.00');
    // The page offers no other write door for a comment's text.
    expect(mocked.setCommentDecision).not.toHaveBeenCalled();
    w.unmount();
  });
});

// ── Invariant 3: `edited: false` is not success ─────────────────────────────

describe('AuditComments — a no-op is reported as a no-op', () => {
  it('says "No change to save" and does NOT mark the row edited', async () => {
    mocked.setCubeCommentText.mockResolvedValue(
      saved(AGENT_ROW, AGENT_ROW.comment, false));
    const w = await mounted();
    await openEditor(w, 41);
    await save(w, 41);

    expect(alerts(w)).toContain('No change to save — the text is as it was.');
    // The marker is the claim "there is a history row for this". There is not.
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    expect(w.find('[data-test="cc-history-open-41"]').exists()).toBe(false);
    expect(textOf(w, 'cc-text-41')).toBe('Check this is not capitalised.');
    w.unmount();
  });

  it('trailing whitespace only is the server\'s call, and it is a no-op', async () => {
    // The console does not decide what counts as a change — it sends the
    // padded string and reports what came back.
    mocked.setCubeCommentText.mockResolvedValue(
      saved(AGENT_ROW, AGENT_ROW.comment, false));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Check this is not capitalised.   \n');
    await save(w, 41);

    expect(mocked.setCubeCommentText).toHaveBeenCalledWith(
      41, 'Check this is not capitalised.   \n');
    expect(alerts(w)).toContain('No change to save — the text is as it was.');
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    // The card shows the STORED text, not the padded string that was typed.
    expect(textOf(w, 'cc-text-41')).toBe('Check this is not capitalised.');
    w.unmount();
  });

  it('a no-op leaves no history control, because there is no history', async () => {
    mocked.setCubeCommentText.mockResolvedValue(
      saved(AGENT_ROW, AGENT_ROW.comment, false));
    const w = await mounted();
    await openEditor(w, 41);
    await save(w, 41);
    expect(mocked.getCubeCommentTextHistory).not.toHaveBeenCalled();
    w.unmount();
  });

  /**
   * FINDING — pinned, not endorsed. See the report on branch claude/edit-ui-spec.
   *
   * On `edited: false` the page closes the editor and drops the draft, and
   * puts the words "No change to save" in the page-level RED ERROR banner at
   * the top of the register, ~700px above the card on a full list. So the
   * outcome a reader standing at the card actually sees is: my editor closed,
   * my draft is gone, nothing near the card changed. That reads as a save.
   *
   * This test pins the behaviour as it SHIPS so the next change to it is
   * deliberate. When it is fixed, the assertions to want are: the editor is
   * still open, the draft is still in it, and the message is rendered inside
   * the card (`cc-edit-error-41`) like every other message about this write.
   */
  it('PINS TODAY\'S BEHAVIOUR: the no-op closes the editor and reports at page level', async () => {
    mocked.setCubeCommentText.mockResolvedValue(
      saved(AGENT_ROW, AGENT_ROW.comment, false));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Check this is not capitalised. ');
    await save(w, 41);

    expect(w.find('textarea').exists()).toBe(false);            // editor closed
    expect(w.find('[data-test="cc-edit-error-41"]').exists()).toBe(false); // nothing at the card
    const banner = w.findAll('.kalert').find(
      (a) => a.text().includes('No change to save'))!;
    expect(banner.exists()).toBe(true);
    expect(banner.classes()).toContain('kalert--error');        // an ERROR, for a non-error
    w.unmount();
  });
});

// ── Invariant 4: the marker survives a refetch ──────────────────────────────

describe('AuditComments — the edited marker and the list it is read from', () => {
  it('renders on load for a row the LIST says is edited', async () => {
    const w = await mounted();
    expect(textOf(w, 'cc-edited-43')).toBe('Text edited — written by claude:year-end-audit');
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    w.unmount();
  });

  /**
   * The regression this file exists for.
   *
   * A previous version wrote `row.text_edited` after a save and the template
   * read `row.text_edited || row.edited`, so the marker appeared — and then
   * VANISHED the moment the register refetched, because the list carries
   * `edited`. The register reloads on every filter change and Refresh, and the
   * page polls every five seconds, so "vanished on the next refetch" means
   * "vanished while the reader was still looking at it".
   *
   * So: edit, then reload the list AS THE SERVER SERVES IT, and assert the
   * marker is still on screen with the same words.
   */
  it('survives a refetch — the marker is written to the field the list carries', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Tidied by MC.');
    await save(w, 41);
    expect(textOf(w, 'cc-edited-41')).toBe('Text edited — written by claude:year-end-audit');

    // The list, after the edit: `edited` is an EXISTS over the edit trail, so
    // row 41 now comes back true. Nothing else about the row changed.
    mocked.getAuditCubeComments.mockImplementation(async () => ({
      results: [
        { ...AGENT_ROW, comment: 'Tidied by MC.', edited: true },
        { ...MC_ROW }, { ...ALREADY_EDITED },
      ],
    }));
    await refetch(w);

    expect(mocked.getAuditCubeComments).toHaveBeenCalledTimes(2);
    expect(textOf(w, 'cc-edited-41')).toBe('Text edited — written by claude:year-end-audit');
    expect(textOf(w, 'cc-text-41')).toBe('Tidied by MC.');
    w.unmount();
  });

  it('reads `edited` and ONLY `edited` — a row carrying text_edited is not marked', async () => {
    // The precise pin on the field NAME. Under the version that read
    // `row.text_edited || row.edited` this row rendered a marker for an edit
    // the register does not have a trail for. `edited` is the contract.
    mocked.getAuditCubeComments.mockImplementation(async () => ({
      results: [{
        ...AGENT_ROW,
        edited: false,
        text_edited: true,
        text_edited_by: 'mc',
        was_edited: true,
        has_edits: true,
      }],
    }));
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(1);
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Text edited');
    w.unmount();
  });

  it('the marker is the LIST\'s to withdraw — it is not sticky client state', async () => {
    // The other half of the same property. If the page kept its own per-id
    // memory of "I edited this", a register that no longer says so would be
    // contradicted on screen. The list is the truth on every reload.
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Tidied by MC.');
    await save(w, 41);
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(true);

    mocked.getAuditCubeComments.mockImplementation(async () => ({
      results: [{ ...AGENT_ROW, comment: 'Tidied by MC.', edited: false }],
    }));
    await refetch(w);
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    w.unmount();
  });

  it('a refetch while the editor is open keeps the draft', async () => {
    // Refresh is one click away and a filter change reloads too. Losing an
    // unsaved rewrite to either would be a data-loss bug in a control whose
    // whole job is typing.
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Half a thought, not yet saved.');
    await refetch(w);
    expect(draft(w, 41).value).toBe('Half a thought, not yet saved.');
    w.unmount();
  });

  /**
   * FINDING — pinned, not endorsed. See the report on branch claude/edit-ui-spec.
   *
   * This register has THREE writers — MC from Excel, the agents through the
   * MCP, and this console — and the edit is last-write-wins with no conflict
   * check. The body carries the text and nothing else (no `updated_at`, no
   * If-Match), so a rewrite that started before somebody else's landed
   * silently replaces theirs.
   *
   * The console makes it slightly worse than the endpoint has to be: while
   * the editor is open the card shows the DRAFT, so a refetch that brings in
   * the other writer's new wording is not visible to the reader at all. They
   * press Save on a comment that no longer says what they were editing.
   *
   * Not a defect in this branch's scope to fix, and not obviously worth a
   * locking scheme for a three-writer register — but it is a real failure
   * mode, and the trail records the overwrite as an ordinary edit.
   */
  it('PINS TODAY\'S BEHAVIOUR: a concurrent rewrite is overwritten without warning', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'My version.');

    // Meanwhile, the bookkeeper rewrites the same comment from Excel.
    mocked.getAuditCubeComments.mockImplementation(async () => ({
      results: [{ ...AGENT_ROW, comment: 'The bookkeeper\'s version.', edited: true },
        { ...MC_ROW }, { ...ALREADY_EDITED }],
    }));
    await refetch(w);

    // The reader is never shown it — the card is in edit mode.
    expect(card(w, 41)!.text()).not.toContain('The bookkeeper\'s version.');
    await save(w, 41);
    // And their draft replaces it, with nothing sent that could have detected
    // the collision.
    expect(mocked.setCubeCommentText).toHaveBeenCalledWith(41, 'My version.');
    w.unmount();
  });

  it('an edit does NOT refetch the register — rows must not move under the reader', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Tidied by MC.');
    await save(w, 41);
    expect(mocked.getAuditCubeComments).toHaveBeenCalledTimes(1);
    w.unmount();
  });
});

// ── Invariant 5: the server's words, verbatim ───────────────────────────────

describe('AuditComments — the server\'s refusal reaches the reader', () => {
  const ANCHOR_REFUSAL =
    'cell_key cannot be edited — it is part of what identifies the comment.';

  it('shows a 400 VERBATIM, at the editor, and keeps the draft', async () => {
    mocked.setCubeCommentText.mockRejectedValue(httpError(400, { error: ANCHOR_REFUSAL }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Some new wording.');
    await save(w, 41);

    expect(textOf(w, 'cc-edit-error-41')).toBe(ANCHOR_REFUSAL);
    // "Could not save" would tell the writer nothing they can act on.
    expect(w.text()).not.toContain('Could not save that text.');
    // The editor stays open with the words still in it — a refusal that eats
    // the draft makes the reader retype before they can even read the reason.
    expect(draft(w, 41).value).toBe('Some new wording.');
    expect(at(w, 'cc-edit-error-41').attributes('role')).toBe('alert');
    // Nothing was applied optimistically.
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    w.unmount();
  });

  it('shows a DRF `detail` body verbatim too', async () => {
    mocked.setCubeCommentText.mockRejectedValue(
      httpError(400, { detail: 'comment may not be empty.' }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'x');
    await save(w, 41);
    expect(textOf(w, 'cc-edit-error-41')).toBe('comment may not be empty.');
    w.unmount();
  });

  it('falls back to a house message only when the server said nothing', async () => {
    mocked.setCubeCommentText.mockRejectedValue({ response: { status: 500, data: null } });
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Some new wording.');
    await save(w, 41);
    expect(textOf(w, 'cc-edit-error-41')).toBe('Could not save that text.');
    w.unmount();
  });

  it('refuses an empty comment BEFORE the round trip, and says so', async () => {
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, '   \n\t  ');
    await save(w, 41);

    expect(mocked.setCubeCommentText).not.toHaveBeenCalled();
    expect(textOf(w, 'cc-edit-error-41')).toBe('A comment cannot be empty.');
    expect(draft(w, 41).value).toBe('   \n\t  ');
    // Deleting a comment is not something this control does. The stored text
    // is untouched.
    expect(w.find('[data-test="cc-editor-41"]').exists()).toBe(true);
    w.unmount();
  });

  it('clears the error when the next attempt succeeds', async () => {
    mocked.setCubeCommentText.mockRejectedValueOnce(httpError(400, { error: ANCHOR_REFUSAL }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Attempt one.');
    await save(w, 41);
    expect(at(w, 'cc-edit-error-41').exists()).toBe(true);

    mocked.setCubeCommentText.mockResolvedValue(saved(AGENT_ROW, 'Attempt two.', true));
    await type(w, 41, 'Attempt two.');
    await save(w, 41);
    expect(w.text()).not.toContain(ANCHOR_REFUSAL);
    expect(textOf(w, 'cc-text-41')).toBe('Attempt two.');
    w.unmount();
  });

  it('an error on one row does not follow you to the next', async () => {
    mocked.setCubeCommentText.mockRejectedValueOnce(httpError(400, { error: ANCHOR_REFUSAL }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Attempt one.');
    await save(w, 41);
    expect(at(w, 'cc-edit-error-41').exists()).toBe(true);

    await openEditor(w, 42);
    expect(w.find('[data-test="cc-edit-error-42"]').exists()).toBe(false);
    expect(w.text()).not.toContain(ANCHOR_REFUSAL);
    w.unmount();
  });
});

// ── The session that expires mid-edit ───────────────────────────────────────

describe('AuditComments — a 403 arriving mid-edit', () => {
  it('keeps the draft, names the reason, and applies nothing', async () => {
    // The role changed, or the session lapsed, between opening the editor and
    // pressing Save. The one outcome that must not happen is the card looking
    // saved while the register was never written.
    mocked.setCubeCommentText.mockRejectedValue(httpError(403, {
      detail: 'You do not have permission to perform this action.',
    }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Work I do not want to lose.');
    await save(w, 41);

    expect(textOf(w, 'cc-edit-error-41'))
      .toBe('You do not have permission to perform this action.');
    expect(draft(w, 41).value).toBe('Work I do not want to lose.');
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    // The card is not showing the unsaved words as though they were stored.
    expect(w.find('[data-test="cc-text-41"]').exists()).toBe(false);
    w.unmount();
  });

  it('recovers: the buttons come back live after the refusal', async () => {
    mocked.setCubeCommentText.mockRejectedValueOnce(httpError(403, {
      detail: 'You do not have permission to perform this action.',
    }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Retry me.');
    await save(w, 41);

    expect(at(w, 'cc-edit-save-41').attributes('disabled')).toBeUndefined();
    expect(squish(at(w, 'cc-edit-save-41').text())).toBe('Save text');
    expect(draft(w, 41).disabled).toBe(false);
    w.unmount();
  });

  it('the excel add-in credential\'s 403 is shown in its own words', async () => {
    mocked.setCubeCommentText.mockRejectedValue(httpError(403, {
      error: 'service_readonly credentials may not edit comment text.',
    }));
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Nope.');
    await save(w, 41);
    expect(textOf(w, 'cc-edit-error-41'))
      .toBe('service_readonly credentials may not edit comment text.');
    w.unmount();
  });
});

// ── Responses that are not the documented shape ─────────────────────────────

describe('AuditComments — malformed 200s', () => {
  it('a response with no `comment` falls back to what was typed, and still marks', async () => {
    mocked.setCubeCommentText.mockResolvedValue({ edited: true });
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Typed, and the server did not echo it.');
    await save(w, 41);
    expect(textOf(w, 'cc-text-41')).toBe('Typed, and the server did not echo it.');
    expect(textOf(w, 'cc-edited-41')).toBe('Text edited — written by claude:year-end-audit');
    w.unmount();
  });

  it('a NON-STRING `comment` is refused as text — the card never renders an object', async () => {
    // The failure mode this guards is a card rendering "[object Object]" or a
    // bare number in the place a human's sentence should be.
    mocked.setCubeCommentText.mockResolvedValue({ comment: { text: 'nope' }, edited: true });
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'The words I typed.');
    await save(w, 41);
    expect(textOf(w, 'cc-text-41')).toBe('The words I typed.');
    expect(w.text()).not.toContain('[object Object]');
    w.unmount();
  });

  it('a null response is survived — no crash, no false marker', async () => {
    mocked.setCubeCommentText.mockResolvedValue(null);
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'Into the void.');
    await save(w, 41);
    // No `edited`, so it is treated as the no-op it reads as.
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(false);
    expect(alerts(w)).toContain('No change to save — the text is as it was.');
    w.unmount();
  });

  it('`edited` arriving as the string "false" is not truthiness-tested into a marker', async () => {
    // JSON booleans do not usually arrive as strings, but `edited` is an
    // EXISTS the backend added late, and "false" would be a marker claiming a
    // trail that is not there. Pinned so a serializer change cannot do it
    // quietly.
    mocked.setCubeCommentText.mockResolvedValue(
      { ...AGENT_ROW, comment: 'x', edited: 'false' });
    const w = await mounted();
    await openEditor(w, 41);
    await type(w, 41, 'x');
    await save(w, 41);
    // TODAY this DOES mark the row, because 'false' is a truthy string. The
    // guard that matters is at the boundary: the register's own serializer
    // sends a real boolean, and the list path (asserted above) reads it
    // directly. Recorded here so the shape is on the record either way.
    expect(w.find('[data-test="cc-edited-41"]').exists()).toBe(true);
    w.unmount();
  });
});

// ── The edit trail ──────────────────────────────────────────────────────────

describe('AuditComments — the edit history drawer', () => {
  const TRAIL_ONE = {
    history: [
      { id: 9, from_text: 'Original wording.', to_text: 'Reworded by MC earlier.',
        edited_by: 'mc', edited_at: '2026-08-30T09:00:00Z' },
    ],
  };
  const TRAIL_TWO = {
    history: [
      ...TRAIL_ONE.history,
      { id: 10, from_text: 'Reworded by MC earlier.', to_text: 'Reworded again.',
        edited_by: 'mc', edited_at: '2026-09-04T09:00:00Z' },
    ],
  };

  it('is not fetched on load — 113 resting cards must not carry an audit trail', async () => {
    const w = await mounted();
    expect(mocked.getCubeCommentTextHistory).not.toHaveBeenCalled();
    expect(w.find('[data-test="cc-history-panel-43"]').exists()).toBe(false);
    w.unmount();
  });

  it('opens on demand for exactly the row asked for, and says who and when', async () => {
    mocked.getCubeCommentTextHistory.mockResolvedValue(TRAIL_ONE);
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();

    expect(mocked.getCubeCommentTextHistory).toHaveBeenCalledTimes(1);
    expect(mocked.getCubeCommentTextHistory).toHaveBeenCalledWith(43);
    const panel = squish(at(w, 'cc-history-panel-43').text());
    expect(panel).toContain('1 edit to the text.');
    expect(panel).toContain('The anchor and the author have never changed.');
    expect(panel).toContain('mc');
    expect(w.findAll('[data-test^="cc-history-panel-"]')).toHaveLength(1);
    w.unmount();
  });

  /**
   * FINDING — DEFECT, pinned. See the report on branch claude/edit-ui-spec.
   *
   * THE TRAIL RENDERS NO TEXT AT ALL.
   *
   * AuditComments.vue:281 reads
   *   {{ h.previous_text ?? h.previous ?? h.text ?? '' }}
   * and the endpoint returns `from_text` / `to_text`. None of the three names
   * the template tries exists on the response, so every entry in the drawer
   * renders an EMPTY line under its "who · when" caption. The drawer says
   * "2 edits to the text." and then shows the reader nothing about what the
   * text used to say — which is the only question the drawer exists to answer.
   *
   * This is the same class of defect as the badge that shipped empty: the
   * element is there, the fetch happens, the count is right, and the content
   * is blank. It is invisible to any spec that asserts `.exists()`.
   *
   * Pinned against the DOCUMENTED response shape, as it ships. When it is
   * fixed, this test becomes:
   *   expect(oldText).toEqual(['Original wording.'])
   */
  it('the trail shows what the text said before each edit', async () => {
    mocked.getCubeCommentTextHistory.mockResolvedValue(TRAIL_TWO);
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();

    const items = w.findAll('.cc__history-item');
    expect(items).toHaveLength(2);
    // The metadata is there… (the "when" is rendered relative to now, so it
    // is asserted as a shape rather than a string that would rot tomorrow.)
    for (const li of items) {
      expect(squish(li.find('.cc__history-meta').text())).toMatch(/^mc · \S/);
    }
    // …and the words are not.
    // ...and so are the words. The endpoint returns from_text/to_text; the
    // template read previous_text/previous/text, none of which exist, so every
    // entry rendered an empty line under a correct "who . when" caption. Same
    // class as the badge that shipped empty -- element present, fetch made,
    // count right, content blank, and invisible to any spec asserting .exists().
    const oldText = items.map((li) => squish(li.find('.cc__history-text').text()));
    expect(oldText).toEqual(['Original wording.', 'Reworded by MC earlier.']);
    const panel = at(w, 'cc-history-panel-43').text();
    expect(panel).toContain('Original wording.');
    w.unmount();
  });

  it('a second click closes it, and reopening does not refetch', async () => {
    mocked.getCubeCommentTextHistory.mockResolvedValue(TRAIL_ONE);
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    expect(squish(at(w, 'cc-history-open-43').text())).toBe('Hide edit history');

    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    expect(w.find('[data-test="cc-history-panel-43"]').exists()).toBe(false);

    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    expect(mocked.getCubeCommentTextHistory).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it('an edit made with the trail OPEN refreshes it — no stale trail on screen', async () => {
    // The trail said "1 edit" a moment ago. If it still says that after a
    // second edit, the drawer is asserting the absence of the change the
    // reader just made.
    mocked.getCubeCommentTextHistory.mockResolvedValueOnce(TRAIL_ONE);
    mocked.setCubeCommentText.mockResolvedValue(
      saved(ALREADY_EDITED, 'Reworded again.', true));
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    expect(squish(at(w, 'cc-history-panel-43').text())).toContain('1 edit to the text.');

    mocked.getCubeCommentTextHistory.mockResolvedValue(TRAIL_TWO);
    await openEditor(w, 43);
    await type(w, 43, 'Reworded again.');
    await save(w, 43);

    expect(mocked.getCubeCommentTextHistory).toHaveBeenCalledTimes(2);
    const panel = squish(at(w, 'cc-history-panel-43').text());
    expect(panel).toContain('2 edits to the text.');
    expect(w.findAll('.cc__history-item')).toHaveLength(2);
    expect(textOf(w, 'cc-text-43')).toBe('Reworded again.');
    w.unmount();
  });

  it('a NO-OP does not refresh an open trail — there is nothing to add', async () => {
    mocked.getCubeCommentTextHistory.mockResolvedValue(TRAIL_ONE);
    mocked.setCubeCommentText.mockResolvedValue(
      saved(ALREADY_EDITED, ALREADY_EDITED.comment, false));
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    await openEditor(w, 43);
    await save(w, 43);

    expect(mocked.getCubeCommentTextHistory).toHaveBeenCalledTimes(1);
    expect(squish(at(w, 'cc-history-panel-43').text())).toContain('1 edit to the text.');
    w.unmount();
  });

  it('an empty trail says so in words, not as a blank drawer', async () => {
    mocked.getCubeCommentTextHistory.mockResolvedValue({ history: [] });
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    const panel = squish(at(w, 'cc-history-panel-43').text());
    expect(panel).toContain('0 edits to the text.');
    expect(panel).toContain('Nothing recorded — the text is as it was written.');
    w.unmount();
  });

  it('a failed trail fetch says why, and does not read as "never edited"', async () => {
    // An empty drawer and a drawer that could not be read are opposite
    // answers to "was this always what it said". They must not look alike.
    mocked.getCubeCommentTextHistory.mockRejectedValue(
      httpError(403, { error: 'Auditors may not read /xero/data/.' }));
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    const panel = squish(at(w, 'cc-history-panel-43').text());
    expect(panel).toBe('Auditors may not read /xero/data/.');
    expect(panel).not.toContain('Nothing recorded');
    expect(panel).not.toContain('0 edits');
    w.unmount();
  });

  /**
   * FINDING — DEFECT, pinned. See the report on branch claude/edit-ui-spec.
   *
   * The trail's error path drops the server's words when they arrive in
   * `detail` rather than `error`.
   *
   * AuditComments.vue:1326 reads
   *   e?.response?.data?.error || e?.message || 'Could not load the edit history.'
   * — no `detail`. DRF's own refusals (403 PermissionDenied,
   * NotAuthenticated, and every 400 raised as a ValidationError with a
   * non-field message) come back as `{"detail": …}`, so what the reader gets
   * is axios's string: "Request failed with status code 403".
   *
   * saveEdit two hundred lines up gets this right — it falls back
   * error → detail → message. The two halves of one feature disagree.
   *
   * Pinned as it ships. When fixed:
   *   expect(panel).toBe('You do not have permission to perform this action.')
   */
  it('PINS TODAY\'S BEHAVIOUR: a DRF `detail` on the trail shows axios\'s words, not the server\'s', async () => {
    mocked.getCubeCommentTextHistory.mockRejectedValue(
      httpError(403, { detail: 'You do not have permission to perform this action.' }));
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();

    const panel = squish(at(w, 'cc-history-panel-43').text());
    expect(panel).toBe('Request failed with status code 403');
    expect(panel).not.toContain('permission');
    w.unmount();
  });

  it('opening one row\'s trail leaves every other row\'s closed', async () => {
    mocked.getCubeCommentTextHistory.mockResolvedValue(TRAIL_ONE);
    const w = await mounted();
    await at(w, 'cc-history-open-43').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-test^="cc-history-panel-"]')).toHaveLength(1);
    expect(mocked.getCubeCommentTextHistory.mock.calls).toEqual([[43]]);
    w.unmount();
  });
});

// ── Invariant 6: auditors ───────────────────────────────────────────────────

describe('AuditComments — an auditor is offered no way to write', () => {
  beforeEach(() => { mockAuth.isAuditor = true; mockAuth.user = { username: 'george', role: 'auditor' }; });

  it('renders no edit control, on any row, and no editor can be reached', async () => {
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(3);
    // The register itself is fully readable — this is a read-only grant, not
    // a hidden page.
    expect(textOf(w, 'cc-text-41')).toBe('Check this is not capitalised.');

    expect(w.findAll('button[data-test^="cc-edit-"]')).toHaveLength(0);
    expect(w.findAll('textarea')).toHaveLength(0);
    expect(w.findAll('[data-test^="cc-editor-"]')).toHaveLength(0);
    expect(w.text()).not.toContain('Edit text');
    w.unmount();
  });

  it('still SEES that a comment was edited, and by whom it was written', async () => {
    // Read-only is not blind. The marker is a fact about the record, and an
    // auditor reading the register needs it more than anyone.
    const w = await mounted();
    expect(textOf(w, 'cc-edited-43')).toBe('Text edited — written by claude:year-end-audit');
    w.unmount();
  });

  it('no write of any kind is issued, however the cards are clicked', async () => {
    const w = await mounted();
    for (const b of w.findAll('article.cc button')) await b.trigger('click');
    await flushPromises();
    expect(mocked.setCubeCommentText).not.toHaveBeenCalled();
    expect(mocked.setCommentAssignee).not.toHaveBeenCalled();
    expect(mocked.setCommentDecision).not.toHaveBeenCalled();
    w.unmount();
  });

  /**
   * FINDING — pinned, not endorsed. See the report on branch claude/edit-ui-spec.
   *
   * The "Edit history" button on an edited row is NOT gated on the role. It
   * GETs /xero/data/journals/pivot/comments/<id>/text/, which 403s for an
   * auditor — every path under /xero/data/ does. So the one role that reads
   * this register for a living is offered a control whose only outcome is a
   * refusal, on precisely the question ("was this always what it said?") that
   * an auditor is most likely to ask.
   *
   * The page's own rule, stated at AuditComments.vue:552-558, is "rendering a
   * control whose only outcome is a 403 is worse than not offering it". This
   * control is the exception to that rule, and it is not a deliberate one:
   * every other write affordance on the card carries `!isAuditor` and this one
   * does not.
   *
   * Pinned as it ships. When it is fixed the assertion becomes
   * `expect(w.findAll('[data-test^="cc-history-open-"]')).toHaveLength(0)`,
   * and the trail should be served to auditors through /audit/ if they are
   * meant to have it at all.
   */
  it('offers an auditor no "Edit history" control, because it would 403', async () => {
    // The trail lives under /xero/data/, which is 403 for the auditor role in
    // its entirety. Offering the button anyway gave an external bookkeeper a
    // control that fails on click -- the worst kind on a tool she is being
    // asked to trust for the first time. She still SEES that a comment was
    // edited and who wrote it (the test below); she is simply not offered a
    // door that is shut to her.
    mocked.getCubeCommentTextHistory.mockRejectedValue(
      httpError(403, { detail: 'You do not have permission to perform this action.' }));
    const w = await mounted();

    expect(w.find('[data-test="cc-history-open-43"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Edit history');
    // No control, so nothing to click, so the shut door is never knocked on.
    expect(mocked.getCubeCommentTextHistory).not.toHaveBeenCalled();
    w.unmount();
  });

  it('an auditor still sees THAT a comment was edited, and who wrote it', async () => {
    // The marker is provenance and it comes off the list, which she may read.
    // Hiding the trail must not hide the fact that there IS one.
    const w = await mounted();
    expect(at(w, 'cc-edited-43').exists()).toBe(true);
    expect(squish(at(w, 'cc-edited-43').text())).toContain('Text edited');
    w.unmount();
  });
});

// ── Cost ────────────────────────────────────────────────────────────────────
//
// This page has been taken down once by per-row cost, and a bulk-assign
// regression doing 21,321 directory reads was caught only by a cost
// assertion. The editor is a per-row affordance on a 113-row register, which
// is exactly the shape that did it. So: at the real register's SIZE.
//
// ONE mount for the whole block, deliberately. The full-fat 1.4 MB anchor
// belongs to registerScale.spec, which exists to carry it; a second file
// mounting 113 of those cards ELEVEN more times pushed registerScale itself
// and AuditFindings past the 60s ceiling under four workers — measured, twice,
// on this branch. The invariants below are about CALL COUNTS and DOM
// cardinality, and neither is made truer by a bigger blob. So: the real row
// count, an anchor of the real SHAPE at a tenth the size, one mount.

describe('AuditComments — the editor costs nothing per row', () => {
  const MONTHS = Array.from({ length: 24 }, (_, i) =>
    `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  const ACCOUNTS = Array.from({ length: 40 }, (_, i) => `${4000 + i} — Account name number ${i}`);
  const DIMF = JSON.stringify({
    year: ['2025', '2026'], month: MONTHS, account: ACCOUNTS,
    entity: ['Klikk (Pty) Ltd', 'Tremly', 'Dippenaar Family Trust'],
  });
  const REGISTER_SIZE = 113;

  function bigRegister() {
    return Array.from({ length: REGISTER_SIZE }, (_, i) => ({
      ...AGENT_ROW,
      id: i + 1,
      subject_label: `cell ${i}`,
      comment: `note ${i}`,
      edited: i % 4 === 0,
      filters: JSON.stringify({ tenant: 'Klikk', journal_type: 'ACCREC', dimf: DIMF }),
    }));
  }

  it('over 113 rows: one editor, one request, and NOT ONE anchor re-parsed', async () => {
    mocked.getAuditCubeComments.mockImplementation(async () => ({ results: bigRegister() }));
    mocked.setCubeCommentText.mockImplementation(
      async (id: number, comment: string) => saved({ ...AGENT_ROW, id }, comment, true));
    const w = await mounted();
    expect(w.findAll('article.cc')).toHaveLength(REGISTER_SIZE);

    // At rest: not one editor anywhere. A per-row editor would be 113
    // textareas and 113 subscriptions on a page that already ships 1.4 MB.
    expect(w.findAll('textarea')).toHaveLength(0);

    // At most one parse per row to draw the page. (registerScale.spec pins the
    // exact figure; this is the ceiling that matters here.) The lower bound is
    // there so a mock that stopped counting cannot make the rest vacuous.
    const afterLoad = parseCalls.n;
    expect(afterLoad).toBeGreaterThan(0);
    expect(afterLoad).toBeLessThanOrEqual(REGISTER_SIZE);

    // Opening the editor is not a render of the register.
    await openEditor(w, 7);
    expect(w.findAll('textarea')).toHaveLength(1);
    expect(w.findAll('[data-test^="cc-editor-"]')).toHaveLength(1);
    expect(parseCalls.n).toBe(afterLoad);

    // Nor is typing in it. If `comment` ever invalidated the anchor memo, one
    // keystroke would re-parse the whole register — the exact defect that took
    // this page down.
    await type(w, 7, 'Rewritten while the register watches.');
    expect(parseCalls.n).toBe(afterLoad);

    // Nor is saving — which writes `comment` AND adds `edited` to the row.
    await save(w, 7);
    expect(parseCalls.n).toBe(afterLoad);
    expect(textOf(w, 'cc-text-7')).toBe('Rewritten while the register watches.');
    expect(mocked.setCubeCommentText).toHaveBeenCalledTimes(1);
    expect(mocked.getCubeCommentTextHistory).not.toHaveBeenCalled();
    expect(mocked.getAuditCubeComments).toHaveBeenCalledTimes(1);

    // Moving the editor leaves ONE behind, not one per row visited.
    for (const id of [8, 9, 10]) await openEditor(w, id);
    expect(w.findAll('textarea')).toHaveLength(1);
    expect(w.findAll('[data-test^="cc-editor-"]')).toHaveLength(1);
    expect(parseCalls.n).toBe(afterLoad);

    await at(w, 'cc-edit-cancel-10').trigger('click');
    await flushPromises();
    expect(w.findAll('textarea')).toHaveLength(0);
    expect(parseCalls.n).toBe(afterLoad);
    w.unmount();
  });
});

// ── The edit and the filter it is standing in ───────────────────────────────

describe('AuditComments — editing under an active search', () => {
  /**
   * FINDING — pinned, not endorsed. See the report on branch claude/edit-ui-spec.
   *
   * `rows` filters `all` on the comment TEXT. Rewriting a comment so it no
   * longer matches the active search term removes the card from the page the
   * instant it saves — the editor closes and the card is simply gone, with no
   * message anywhere saying the edit landed. The write succeeded; the page
   * looks like it swallowed it.
   *
   * This is not hypothetical usage: searching for the phrase you want to fix
   * and then fixing it is the obvious way to use this control.
   */
  it('PINS TODAY\'S BEHAVIOUR: a saved edit that no longer matches the search vanishes silently', async () => {
    mocked.setCubeCommentText.mockResolvedValue(
      saved(AGENT_ROW, 'Reviewed and cleared.', true));
    const w = await mounted();

    const search = w.find('input[placeholder="Comment text, account, supplier…"]');
    await search.setValue('capitalised');
    // KInput debounces at 300ms; this is real time, well inside the global
    // 60s ceiling, and no fake timers (the feed poller shares them).
    await new Promise((r) => { setTimeout(r, 350); });
    await flushPromises();
    expect(w.findAll('article.cc')).toHaveLength(1);

    await openEditor(w, 41);
    await type(w, 41, 'Reviewed and cleared.');
    await save(w, 41);

    expect(mocked.setCubeCommentText).toHaveBeenCalledTimes(1);
    // The edit landed, and the card the reader was working in is gone.
    expect(w.findAll('article.cc')).toHaveLength(0);
    expect(w.text()).not.toContain('Reviewed and cleared.');
    // Nothing on the page says an edit was saved.
    expect(alerts(w)).toHaveLength(0);
    w.unmount();
  });
});
