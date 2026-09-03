import { ref, onMounted, onBeforeUnmount } from 'vue';
import { getCommentFeed } from '../api/comments';
import { useToast } from './useToast';

/**
 * useCommentFeed — surface comments other people leave, without a reload.
 *
 * Polls GET /audit/comments/feed/ every `intervalMs` while the tab is visible.
 * MC's ask was "comments update live as someone types"; live TYPING indicators
 * are explicitly out of scope — a new comment surfaces within one poll
 * interval (5s by default).
 *
 * Three deliberate choices:
 *
 *  - **Pause when hidden.** A background tab polling every 5s forever is a
 *    battery and server cost for nothing. On becoming visible again it polls
 *    IMMEDIATELY, so returning to the tab is not a 5s wait.
 *  - **The cursor comes from the server.** `now` in the response is the
 *    server's clock; carrying the browser's forward would drift and either
 *    replay or skip events.
 *  - **No overlapping polls.** A slow response must not stack requests; the
 *    in-flight flag skips a tick rather than queueing one.
 *  - **The first poll only primes the cursor.** It races the page's own list
 *    fetch, so its events would land on rows that do not exist yet and be
 *    silently lost. It would also be wrong to announce them: a freshly loaded
 *    register already shows every comment made before it loaded, so replaying
 *    the server's default window as "new" would toast the user about comments
 *    they are already looking at.
 *
 * @param {Object}   options
 * @param {string}   options.kind        — 'receipt' | 'finding': events of the other kind are ignored
 * @param {Function} options.onEvents    — (events[]) => void, called with this page's events only
 * @param {Function} [options.currentUser] — () => username; your own comments raise no toast
 * @param {number}   [options.intervalMs]
 * @param {boolean}  [options.notify]    — raise toasts for other people's comments (default true)
 */
export function useCommentFeed({
  kind,
  onEvents,
  currentUser = () => '',
  intervalMs = 5000,
  notify = true,
} = {}) {
  const toast = useToast();
  const cursor = ref(null);
  const polling = ref(false);
  const lastError = ref(null);

  let timer = null;
  let inFlight = false;
  let stopped = false;
  let primed = false;

  function announce(events) {
    if (!notify || !events.length) return;
    const me = currentUser() || '';
    const theirs = events.filter((e) => (e.comment?.author || '') !== me);
    if (!theirs.length) return;
    // One toast per poll cycle. Three separate people commenting is worth
    // three toasts; a burst of ten is a wall the user will dismiss blindly.
    if (theirs.length > 3) {
      toast.info(`${theirs.length} new comments on the audit register`);
      return;
    }
    for (const e of theirs) {
      toast.info(`New comment from ${e.comment?.author || 'someone'} on ${e.object_ref || 'an item'}`);
    }
  }

  async function poll() {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const data = await getCommentFeed(cursor.value);
      // Advance the cursor even when nothing matched THIS page's kind —
      // otherwise the other surface's events are re-fetched forever.
      if (data?.now) cursor.value = data.now;
      lastError.value = null;
      if (!primed) {
        // See the header: the first response only establishes the cursor.
        primed = true;
        return;
      }
      const events = (Array.isArray(data?.events) ? data.events : [])
        .filter((e) => e && e.kind === kind);
      if (events.length) {
        onEvents?.(events);
        announce(events);
      }
    } catch (err) {
      // A failed poll is not worth interrupting the user over — the next tick
      // retries, and the cursor is untouched so nothing is missed.
      lastError.value = err;
    } finally {
      inFlight = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (stopped || document.visibilityState !== 'visible') return;
    timer = setTimeout(async () => {
      await poll();
      schedule();
    }, intervalMs);
  }

  async function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      polling.value = true;
      await poll(); // catch up straight away rather than after a full interval
      schedule();
    } else {
      polling.value = false;
      clearTimeout(timer);
    }
  }

  function start() {
    stopped = false;
    primed = false;
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.visibilityState === 'visible') {
      polling.value = true;
      // The first poll primes the cursor. `since` is omitted, so the server
      // uses its short default window — a fresh page does not replay history.
      poll().then(schedule);
    }
  }

  function stop() {
    stopped = true;
    polling.value = false;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  onMounted(start);
  onBeforeUnmount(stop);

  return { cursor, polling, lastError, poll, start, stop };
}
