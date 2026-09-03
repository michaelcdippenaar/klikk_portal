// @vitest-environment happy-dom
/**
 * ReceiptCommentCell.spec.ts
 *
 * Adversarial mount-based spec for the inline row-comment cell on
 * Audit → Receipts (src/components/receipts/ReceiptCommentCell.vue).
 *
 * The REAL component is mounted with its REAL KPopover (reka-ui portal);
 * only src/api/receipts is mocked. The popover content teleports to <body>,
 * so panel elements are queried from `document`, and typing/submitting is
 * done with native DOM events (input / form submit — the Enter path).
 *
 * What is verified:
 *   - the trigger renders the count from props; 0 / undefined / NaN → "0"
 *   - opening fetches the thread ONCE (open → close → reopen: 1 getReceipt)
 *     and renders the existing comments
 *   - submit posts postReceiptComment(sha, TRIMMED text), clears the input,
 *     appends to the thread, and emits `added` with the right sha256
 *   - the DOM count increments after a post WITHOUT any prop update from the
 *     parent (no page reload), and does NOT double-count when the parent then
 *     bumps the prop to the same value
 *   - whitespace-only / empty drafts cannot submit (disabled button, no call)
 *   - a failed thread fetch degrades to input-only: posting still works
 *   - a failed post surfaces comment-error, keeps the draft, does not
 *     bump the count — and a retry can still succeed
 *   - clicks inside the cell do NOT bubble to a parent row-click handler
 *     (the row click opens the detail modal; commenting must not)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';

// ── Mocks — the network boundary only ───────────────────────────────────────

vi.mock('../../../api/receipts', () => ({
  getReceipt: vi.fn(),
  postReceiptComment: vi.fn(),
}));

import * as api from '../../../api/receipts';
import ReceiptCommentCell from '../ReceiptCommentCell.vue';

const mocked = api as unknown as {
  getReceipt: ReturnType<typeof vi.fn>;
  postReceiptComment: ReturnType<typeof vi.fn>;
};

// ── Fixtures — production shapes ────────────────────────────────────────────

const SHA = 'f'.repeat(64);

const COMMENTS = [
  { id: 11, text: 'Chase the VAT invoice', author: 'mc', created_at: '2026-08-10T08:15:00Z' },
  { id: 12, text: 'Bookkeeper pinged', author: 'anine', created_at: '2026-08-11T09:00:00Z' },
];

/** The single-receipt endpoint returns the FULL row + ocr/items/comments. */
function receiptResponse(comments = COMMENTS, extra: Record<string, unknown> = {}) {
  return {
    sha256: SHA,
    filename: 'IMG_0042.jpg',
    supplier: 'Makro',
    total: '21600.00',
    review: { to_process: false, decision: '', note: '', archived: false, updated_by: '', updated_at: null },
    ocr: { supplier: 'Makro', total: '21600.00' },
    items: [],
    comments,
    comment_count: comments.length,
    ...extra,
  };
}

// ── Harness ─────────────────────────────────────────────────────────────────

let warnings: string[];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function mountCell(props: Record<string, unknown> = {}) {
  return mount(ReceiptCommentCell, {
    props: { sha256: SHA, ...props },
    attachTo: document.body,
    global: {
      config: {
        warnHandler: (msg: string) => { warnings.push(msg); },
      },
    },
  });
}

/** Popover panel elements teleport to <body> — query them from document. */
function q<T extends Element = HTMLElement>(sel: string): T | null {
  return document.body.querySelector(sel) as T | null;
}

function panelOpen(): boolean {
  return q('[data-test="comment-input"]') !== null;
}

/** One entry per rendered comment — <article>, not <li>: replies are nested
 *  lists, so an li-based query would count parents twice. */
function threadTexts(): string[] {
  return [...document.body.querySelectorAll('[data-test="comment"], [data-test="comment-reply"]')]
    .map((el) => el.textContent || '');
}

async function openPopover(w: ReturnType<typeof mount>) {
  await w.get('[data-test="inline-comment-trigger"]').trigger('click');
  await flushPromises();
  expect(panelOpen(), 'popover should be open').toBe(true);
}

async function closePopover(w: ReturnType<typeof mount>) {
  await w.get('[data-test="inline-comment-trigger"]').trigger('click');
  await flushPromises();
  expect(panelOpen(), 'popover should be closed').toBe(false);
}

async function typeDraft(text: string) {
  const input = q<HTMLTextAreaElement>('[data-test="comment-input"]')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

/** Submit the one-line form the way the user does — Enter fires form submit. */
async function submitForm() {
  const form = q<HTMLTextAreaElement>('[data-test="comment-input"]')!.closest('form')!;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flushPromises();
}

function submitBtn(): HTMLButtonElement {
  return q<HTMLButtonElement>('[data-test="comment-submit"]')!;
}

beforeEach(() => {
  warnings = [];
  mocked.getReceipt.mockReset().mockResolvedValue(receiptResponse());
  mocked.postReceiptComment.mockReset();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  document.body.innerHTML = '';
});

// ── Count rendering ─────────────────────────────────────────────────────────

describe('ReceiptCommentCell — count rendering', () => {
  it('renders the count from props', async () => {
    const w = mountCell({ count: 5 });
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('5');
    expect(w.get('[data-test="inline-comment-trigger"]').attributes('aria-label')).toBe(
      '5 comments — click to read or add',
    );
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('renders 0 for count 0, for an omitted count, and for NaN', async () => {
    for (const props of [{ count: 0 }, {}, { count: NaN }]) {
      const w = mountCell(props);
      expect(w.get('[data-test="inline-comment-count"]').text(), JSON.stringify(props)).toBe('0');
      // Zero comments must not fetch anything on render.
      expect(mocked.getReceipt).not.toHaveBeenCalled();
      w.unmount();
    }
    expect(warnings).toEqual([]);
  });

  it('renders NOTHING network-wise on mount — the list must never fan out N getReceipt calls', () => {
    const w = mountCell({ count: 3 });
    expect(mocked.getReceipt).not.toHaveBeenCalled();
    expect(mocked.postReceiptComment).not.toHaveBeenCalled();
    w.unmount();
  });
});

// ── Lazy thread fetch ───────────────────────────────────────────────────────

describe('ReceiptCommentCell — lazy thread fetch', () => {
  it('opening fetches the thread ONCE and renders the existing comments; close + reopen does NOT refetch', async () => {
    const w = mountCell({ count: 2 });

    await openPopover(w);
    expect(mocked.getReceipt).toHaveBeenCalledTimes(1);
    expect(mocked.getReceipt).toHaveBeenCalledWith(SHA);

    const items = threadTexts();
    expect(items.length).toBe(2);
    expect(items[0]).toContain('Chase the VAT invoice');
    expect(items[0]).toContain('mc');
    expect(items[1]).toContain('Bookkeeper pinged');

    await closePopover(w);
    await openPopover(w);

    // Still exactly one fetch — the thread was loaded once and kept.
    expect(mocked.getReceipt).toHaveBeenCalledTimes(1);
    expect(threadTexts().length).toBe(2);
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('an empty thread shows "No comments yet." and no thread list', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse([]));
    const w = mountCell({ count: 0 });
    await openPopover(w);
    expect(q('.kp-content')!.textContent).toContain('No comments yet.');
    expect(q('[data-test="comment-thread"]')).toBeNull();
    w.unmount();
  });

  it('a malformed detail payload (comments: not-an-array) degrades to an empty thread without throwing', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse([], { comments: { weird: true } }));
    const w = mountCell({ count: 1 });
    await openPopover(w);
    expect(q('[data-test="comment-thread"]')).toBeNull();
    expect(panelOpen()).toBe(true);
    expect(warnings).toEqual([]);
    w.unmount();
  });
});

// ── Posting ─────────────────────────────────────────────────────────────────

describe('ReceiptCommentCell — posting a comment', () => {
  it('posts the TRIMMED text, clears the input, appends to the thread, and emits added with the sha256', async () => {
    mocked.postReceiptComment.mockResolvedValue({
      id: 99, text: 'Ask for the credit note', author: 'mc', created_at: '2026-08-20T06:00:00Z',
    });
    const w = mountCell({ count: 2 });

    await openPopover(w);
    await typeDraft('   Ask for the credit note  ');
    await submitForm();

    expect(mocked.postReceiptComment).toHaveBeenCalledTimes(1);
    expect(mocked.postReceiptComment).toHaveBeenCalledWith(SHA, 'Ask for the credit note');

    // Input cleared; comment appended to the visible thread.
    expect(q<HTMLTextAreaElement>('[data-test="comment-input"]')!.value).toBe('');
    const items = threadTexts();
    expect(items.length).toBe(3);
    expect(items[2]).toContain('Ask for the credit note');

    // Emitted for the parent row — sha + the new count.
    const added = w.emitted('added');
    expect(added).toBeTruthy();
    expect(added!.length).toBe(1);
    const payload = added![0][0] as { sha256: string; comment: { id: number }; count: number };
    expect(payload.sha256).toBe(SHA);
    expect(payload.comment.id).toBe(99);
    expect(payload.count).toBe(3);
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('the DOM count increments after a post with NO prop update, and does not double-count when the parent then bumps the prop', async () => {
    mocked.postReceiptComment.mockResolvedValue({ id: 50, text: 'noted', author: 'mc', created_at: null });
    const w = mountCell({ count: 2 });
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('2');

    await openPopover(w);
    await typeDraft('noted');
    await submitForm();

    // The parent has NOT updated :count — the cell itself must show 3.
    expect(w.props('count')).toBe(2);
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('3');

    // Parent catches up (row comment_count bumped via the added event) — the
    // max() must not stack the optimistic bump on top of the prop bump.
    await w.setProps({ count: 3 });
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('3');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('whitespace-only / empty drafts cannot submit — button disabled and NO API call even via form submit', async () => {
    const w = mountCell({ count: 0 });
    await openPopover(w);

    // Empty draft.
    expect(submitBtn().disabled).toBe(true);
    await submitForm();
    expect(mocked.postReceiptComment).not.toHaveBeenCalled();

    // Whitespace-only draft.
    await typeDraft('   \t  ');
    expect(submitBtn().disabled).toBe(true);
    await submitForm();
    expect(mocked.postReceiptComment).not.toHaveBeenCalled();

    // Real text enables it.
    await typeDraft('real note');
    expect(submitBtn().disabled).toBe(false);
    w.unmount();
  });
});

// ── Failure paths ───────────────────────────────────────────────────────────

describe('ReceiptCommentCell — failure paths', () => {
  it('getReceipt rejecting degrades to input-only: the input stays usable and a post still works', async () => {
    mocked.getReceipt.mockRejectedValue(new Error('500'));
    mocked.postReceiptComment.mockResolvedValue({ id: 7, text: 'still works', author: 'mc', created_at: null });

    const w = mountCell({ count: 4 });
    await openPopover(w);

    // No thread, no error banner — just the writable input.
    expect(q('[data-test="comment-thread"]')).toBeNull();
    expect(q('[data-test="comment-error"]')).toBeNull();
    const input = q<HTMLTextAreaElement>('[data-test="comment-input"]')!;
    expect(input.disabled).toBe(false);

    await typeDraft('still works');
    await submitForm();

    expect(mocked.postReceiptComment).toHaveBeenCalledWith(SHA, 'still works');
    // The posted comment shows even though the thread never loaded.
    expect(threadTexts().length).toBe(1);
    expect(threadTexts()[0]).toContain('still works');
    expect(w.emitted('added')!.length).toBe(1);
    w.unmount();
  });

  it('postReceiptComment rejecting surfaces comment-error, keeps the draft, and does NOT bump the count — retry succeeds', async () => {
    mocked.postReceiptComment.mockRejectedValueOnce(new Error('500'));
    const w = mountCell({ count: 2 });

    await openPopover(w);
    await typeDraft('important context');
    await submitForm();

    const err = q('[data-test="comment-error"]');
    expect(err).not.toBeNull();
    expect(err!.textContent).toContain('Could not post');
    // Draft preserved for retry; nothing appended; count NOT bumped; no event.
    expect(q<HTMLTextAreaElement>('[data-test="comment-input"]')!.value).toBe('important context');
    expect(threadTexts().length).toBe(2);
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('2');
    expect(w.emitted('added')).toBeFalsy();

    // Retry with the same draft now succeeds and clears the error.
    mocked.postReceiptComment.mockResolvedValue({ id: 60, text: 'important context', author: 'mc', created_at: null });
    await submitForm();
    expect(q('[data-test="comment-error"]')).toBeNull();
    expect(threadTexts().length).toBe(3);
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('3');
    expect(w.emitted('added')!.length).toBe(1);
    w.unmount();
  });
});

// ── Click containment ───────────────────────────────────────────────────────

describe('ReceiptCommentCell — click containment', () => {
  it('a click on the trigger does NOT bubble to a parent row-click handler (which would open the detail modal)', async () => {
    const rowClick = vi.fn();
    const Host = defineComponent({
      components: { ReceiptCommentCell },
      props: { onRowClickSpy: { type: Function, required: true } },
      template: `
        <div data-test="host-row" @click="onRowClickSpy">
          <ReceiptCommentCell sha256="${SHA}" :count="2" />
        </div>
      `,
    });
    const host = mount(Host, {
      props: { onRowClickSpy: rowClick },
      attachTo: document.body,
      global: { config: { warnHandler: (msg: string) => { warnings.push(msg); } } },
    });

    // Sanity: a click elsewhere in the row DOES reach the handler.
    await host.get('[data-test="host-row"]').trigger('click');
    expect(rowClick).toHaveBeenCalledTimes(1);
    rowClick.mockClear();

    // The comment trigger must not leak its click to the row.
    await host.get('[data-test="inline-comment-trigger"]').trigger('click');
    await flushPromises();
    expect(panelOpen(), 'the click still opened the popover').toBe(true);
    expect(rowClick).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    host.unmount();
  });
});

// ── Threading (parent_id) ───────────────────────────────────────────────────

const THREADED = [
  { id: 11, parent_id: null, text: 'Chase the VAT invoice', author: 'mc', created_at: '2026-08-10T08:15:00Z' },
  { id: 12, parent_id: 11, text: 'Supplier says it is coming', author: 'anine', created_at: '2026-08-10T09:00:00Z' },
  { id: 13, parent_id: null, text: 'Separate question about the total', author: 'auditor@x.co', created_at: '2026-08-11T09:00:00Z' },
];

describe('ReceiptCommentCell — threading', () => {
  it('renders replies nested under their parent, not as top-level comments', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse(THREADED));
    const w = mountCell({ count: 3 });
    await openPopover(w);

    const roots = [...document.body.querySelectorAll('[data-test="comment"]')];
    const replies = [...document.body.querySelectorAll('[data-test="comment-reply"]')];
    expect(roots.map((el) => el.textContent)).toEqual([
      expect.stringContaining('Chase the VAT invoice'),
      expect.stringContaining('Separate question about the total'),
    ]);
    expect(replies.map((el) => el.textContent)).toEqual([
      expect.stringContaining('Supplier says it is coming'),
    ]);
    // The reply lives INSIDE its parent's <li>, which is what indents it.
    expect(roots[0].closest('li')!.contains(replies[0])).toBe(true);
    expect(roots[1].closest('li')!.contains(replies[0])).toBe(false);
    // Every comment names its author.
    expect(replies[0].textContent).toContain('anine');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('a new top-level comment posts WITHOUT a parent id', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse(THREADED));
    mocked.postReceiptComment.mockResolvedValue({
      id: 14, parent_id: null, text: 'new top level', author: 'mc', created_at: '2026-08-12T09:00:00Z',
    });
    const w = mountCell({ count: 3 });
    await openPopover(w);
    await typeDraft('new top level');
    await submitForm();

    expect(mocked.postReceiptComment).toHaveBeenCalledWith(SHA, 'new top level');
    expect(mocked.postReceiptComment.mock.calls[0].length).toBe(2);
    w.unmount();
  });

  it('Reply opens a composer bound to that comment and posts with its parent id', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse(THREADED));
    mocked.postReceiptComment.mockResolvedValue({
      id: 15, parent_id: 11, text: 'chasing again', author: 'mc', created_at: '2026-08-12T09:00:00Z',
    });
    const w = mountCell({ count: 3 });
    await openPopover(w);

    // No reply composer until asked for.
    expect(q('[data-test="comment-reply-input-11"]')).toBeNull();
    q<HTMLButtonElement>('[data-test="comment-reply-11"]')!.click();
    await nextTick();

    const replyInput = q<HTMLTextAreaElement>('[data-test="comment-reply-input-11"]')!;
    expect(replyInput).not.toBeNull();
    replyInput.value = '  chasing again  ';
    replyInput.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    replyInput.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(mocked.postReceiptComment).toHaveBeenCalledWith(SHA, 'chasing again', { parentId: 11 });
    // The reply lands under its parent and the count bumps.
    const replies = [...document.body.querySelectorAll('[data-test="comment-reply"]')];
    expect(replies.map((el) => el.textContent)).toEqual([
      expect.stringContaining('Supplier says it is coming'),
      expect.stringContaining('chasing again'),
    ]);
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('4');
    expect(warnings).toEqual([]);
    w.unmount();
  });

  it('replying to a reply targets the ROOT, so the client never asks for a third level', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse(THREADED));
    mocked.postReceiptComment.mockResolvedValue({
      id: 16, parent_id: 11, text: 'noted', author: 'mc', created_at: '2026-08-12T10:00:00Z',
    });
    const w = mountCell({ count: 3 });
    await openPopover(w);

    // The Reply button ON THE REPLY (id 12) opens the composer for root 11.
    q<HTMLButtonElement>('[data-test="comment-reply-12"]')!.click();
    await nextTick();
    const replyInput = q<HTMLTextAreaElement>('[data-test="comment-reply-input-11"]')!;
    expect(replyInput).not.toBeNull();
    replyInput.value = 'noted';
    replyInput.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    replyInput.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(mocked.postReceiptComment).toHaveBeenCalledWith(SHA, 'noted', { parentId: 11 });
    w.unmount();
  });

  it('a failed reply keeps the reply draft for retry', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse(THREADED));
    mocked.postReceiptComment.mockRejectedValue(new Error('boom'));
    const w = mountCell({ count: 3 });
    await openPopover(w);

    q<HTMLButtonElement>('[data-test="comment-reply-11"]')!.click();
    await nextTick();
    const replyInput = q<HTMLTextAreaElement>('[data-test="comment-reply-input-11"]')!;
    replyInput.value = 'expensive to retype';
    replyInput.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    replyInput.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(q('[data-test="comment-error"]')).not.toBeNull();
    expect(q<HTMLTextAreaElement>('[data-test="comment-reply-input-11"]')!.value)
      .toBe('expensive to retype');
    expect(w.get('[data-test="inline-comment-count"]').text()).toBe('3');
    w.unmount();
  });

  it('an orphan reply (parent not in the list) still renders rather than vanishing', async () => {
    mocked.getReceipt.mockResolvedValue(receiptResponse([
      { id: 20, parent_id: 999, text: 'orphaned but real', author: 'mc', created_at: '2026-08-10T08:15:00Z' },
    ]));
    const w = mountCell({ count: 1 });
    await openPopover(w);

    expect(threadTexts().join(' ')).toContain('orphaned but real');
    expect(warnings).toEqual([]);
    w.unmount();
  });
});
