// @vitest-environment happy-dom
/**
 * useCommentFeed.spec.ts
 *
 * The polling loop behind "comments update live". Fake timers throughout; the
 * API module and the toast composable are mocked.
 *
 * What is verified:
 *   - an immediate poll on mount, then one every intervalMs
 *   - the FIRST poll only primes the cursor: its events are neither delivered
 *     nor announced (it races the page's own list fetch)
 *   - the cursor comes from the SERVER's `now` and is carried forward
 *   - events of another `kind` are filtered out, but the cursor STILL advances
 *     (otherwise the other surface's events are re-fetched forever)
 *   - polling pauses while the tab is hidden and polls immediately on return
 *   - a failed poll neither throws nor advances the cursor
 *   - toasts: none for your own comments, one per other person, collapsed to a
 *     single summary above three
 *   - stop() on unmount: no further polls, listener removed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('../../api/comments', () => ({ getCommentFeed: vi.fn() }));

const toastCalls = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../useToast', () => ({ useToast: () => toastCalls }));

import { getCommentFeed } from '../../api/comments';
import { useCommentFeed } from '../useCommentFeed';

const feed = getCommentFeed as unknown as ReturnType<typeof vi.fn>;

function event(kind: string, id: number, author = 'anine', objectId = 'obj-1') {
  return {
    kind,
    object_id: objectId,
    object_ref: 'Makro · 2026-08-04 · R259.00',
    comment: { id, parent_id: null, author, text: `c${id}`, created_at: '2026-08-20T09:00:00Z' },
  };
}

/** Mount a throwaway component so onMounted / onBeforeUnmount really run. */
function mountFeed(options: Record<string, unknown> = {}) {
  const seen: unknown[][] = [];
  const api: { value: ReturnType<typeof useCommentFeed> | null } = { value: null };
  const Host = defineComponent({
    setup() {
      api.value = useCommentFeed({
        kind: 'receipt',
        onEvents: (events: unknown[]) => { seen.push(events); },
        ...options,
      });
      return () => h('div');
    },
  });
  const wrapper = mount(Host);
  return { wrapper, seen, api };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state, configurable: true, writable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Let the awaited poll chain settle between timer ticks. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  toastCalls.info.mockReset();
  feed.mockReset().mockResolvedValue({ now: '2026-08-20T09:00:00Z', events: [] });
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCommentFeed — polling cadence', () => {
  it('polls immediately on mount, then every 5s', async () => {
    const { wrapper } = mountFeed();
    await settle();
    expect(feed).toHaveBeenCalledTimes(1);
    expect(feed).toHaveBeenCalledWith(null); // first call primes the cursor

    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(feed).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(feed).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('carries the SERVER cursor forward on every poll', async () => {
    feed.mockResolvedValueOnce({ now: '2026-08-20T10:00:00Z', events: [] });
    feed.mockResolvedValueOnce({ now: '2026-08-20T10:00:05Z', events: [] });
    const { wrapper, api } = mountFeed();
    await settle();

    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(feed).toHaveBeenLastCalledWith('2026-08-20T10:00:00Z');
    expect(api.value!.cursor.value).toBe('2026-08-20T10:00:05Z');
    wrapper.unmount();
  });

  it('honours a custom interval', async () => {
    const { wrapper } = mountFeed({ intervalMs: 1000 });
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(feed).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('stops polling after unmount', async () => {
    const { wrapper } = mountFeed();
    await settle();
    wrapper.unmount();
    const calls = feed.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(feed).toHaveBeenCalledTimes(calls);
  });
});

describe('useCommentFeed — visibility', () => {
  it('pauses while hidden and polls IMMEDIATELY on return', async () => {
    const { wrapper } = mountFeed();
    await settle();
    expect(feed).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(feed, 'polled while hidden').toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await settle();
    expect(feed, 'did not catch up on return').toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});

describe('useCommentFeed — events', () => {
  it('the FIRST poll only primes the cursor — its events are dropped', async () => {
    feed.mockResolvedValueOnce({
      now: '2026-08-20T10:00:00Z',
      events: [event('receipt', 1)],
    });
    const { wrapper, seen, api } = mountFeed();
    await settle();
    expect(seen).toEqual([]);
    expect(api.value!.cursor.value).toBe('2026-08-20T10:00:00Z');
    expect(toastCalls.info).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('delivers only this page kind, but still advances the cursor', async () => {
    feed.mockResolvedValueOnce({ now: 'prime', events: [] });
    feed.mockResolvedValueOnce({
      now: '2026-08-20T10:00:00Z',
      events: [event('receipt', 1), event('finding', 2)],
    });
    const { wrapper, seen, api } = mountFeed();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    expect((seen[0][0] as { comment: { id: number } }).comment.id).toBe(1);
    expect(api.value!.cursor.value).toBe('2026-08-20T10:00:00Z');
    wrapper.unmount();
  });

  it('does not call onEvents when nothing of this kind arrived', async () => {
    feed.mockResolvedValueOnce({ now: 'prime', events: [] });
    feed.mockResolvedValueOnce({ now: 'x', events: [event('finding', 9)] });
    const { wrapper, seen } = mountFeed();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(seen).toEqual([]);
    wrapper.unmount();
  });

  it('a failing poll neither throws nor moves the cursor, and the next tick retries', async () => {
    feed.mockResolvedValueOnce({ now: '2026-08-20T10:00:00Z', events: [] });
    feed.mockRejectedValueOnce(new Error('network'));
    feed.mockResolvedValueOnce({ now: '2026-08-20T10:00:10Z', events: [] });

    const { wrapper, api } = mountFeed();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(api.value!.cursor.value, 'cursor moved past a failed poll').toBe('2026-08-20T10:00:00Z');
    expect(api.value!.lastError.value).toBeTruthy();

    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(api.value!.cursor.value).toBe('2026-08-20T10:00:10Z');
    expect(api.value!.lastError.value).toBeNull();
    wrapper.unmount();
  });
});

describe('useCommentFeed — toasts', () => {
  it('says nothing about your own comment', async () => {
    feed.mockResolvedValueOnce({ now: 'prime', events: [] });
    feed.mockResolvedValueOnce({ now: 'x', events: [event('receipt', 1, 'mc')] });
    const { wrapper } = mountFeed({ currentUser: () => 'mc' });
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(toastCalls.info).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('one toast per other person, naming author and object', async () => {
    feed.mockResolvedValueOnce({ now: 'prime', events: [] });
    feed.mockResolvedValueOnce({
      now: 'x',
      events: [event('receipt', 1, 'anine'), event('receipt', 2, 'auditor@x.co')],
    });
    const { wrapper } = mountFeed({ currentUser: () => 'mc' });
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(toastCalls.info).toHaveBeenCalledTimes(2);
    expect(toastCalls.info.mock.calls[0][0]).toContain('anine');
    expect(toastCalls.info.mock.calls[0][0]).toContain('Makro');
    wrapper.unmount();
  });

  it('collapses to ONE summary above three, so a burst is not a wall', async () => {
    feed.mockResolvedValueOnce({ now: 'prime', events: [] });
    feed.mockResolvedValueOnce({
      now: 'x',
      events: [1, 2, 3, 4, 5].map((i) => event('receipt', i, 'anine')),
    });
    const { wrapper } = mountFeed({ currentUser: () => 'mc' });
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(toastCalls.info).toHaveBeenCalledTimes(1);
    expect(toastCalls.info.mock.calls[0][0]).toContain('5 new comments');
    wrapper.unmount();
  });

  it('notify:false silences them entirely but still delivers events', async () => {
    feed.mockResolvedValueOnce({ now: 'prime', events: [] });
    feed.mockResolvedValueOnce({ now: 'x', events: [event('receipt', 1, 'anine')] });
    const { wrapper, seen } = mountFeed({ notify: false, currentUser: () => 'mc' });
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(toastCalls.info).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
    wrapper.unmount();
  });
});
