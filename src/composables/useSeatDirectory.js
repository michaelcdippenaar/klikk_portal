import { ref, computed } from 'vue';
import { getPeople } from '../api/people';

/**
 * The seat directory, as a page consumes it.
 *
 * Assignment names a ROLE and not a person — `bookkeeper`, not `anzelle` — so
 * everything here has exactly two jobs:
 *
 *   1. `seats` — what may be OFFERED. Active handles only. An inactive handle
 *      is refused by the server with a 400 ("assigning to a role nobody holds
 *      is the same as assigning to nobody"), so offering one would be offering
 *      a choice that cannot be made. It is filtered HERE, on `active`, rather
 *      than trusted from the endpoint's default: the fetch asks for everyone
 *      on purpose (see below), and a list that is active-only by accident of
 *      the query string is one query-string edit away from being wrong.
 *
 *   2. `labelFor` — what may be SHOWN. Every handle, active or not, because a
 *      comment already sitting with a stood-down seat still has to say whose
 *      queue it is in. Those rows are deliberately left alone by the backend;
 *      the console must not render them as blank.
 *
 * Per-caller state, not a module singleton. The page mounts once and fetches
 * once, so a shared cache buys nothing — and it would leak a directory between
 * tests and between logins, which costs something real.
 */
export function useSeatDirectory() {
  const people = ref([]);
  const loading = ref(false);
  const error = ref('');
  const loaded = ref(false);

  /** Handle (lowercased) → person. Handles are stored lowercased server-side. */
  const byHandle = computed(() => {
    const m = new Map();
    people.value.forEach((p) => {
      const h = String(p?.handle || '').trim().toLowerCase();
      if (h) m.set(h, p);
    });
    return m;
  });

  /** The seats a comment may be assigned TO, in directory order. */
  const seats = computed(() => people.value.filter((p) => p && p.active));

  /**
   * The person behind a handle, or null.
   * Returns the record whether or not the seat is still held, so the caller can
   * decide how to say so.
   */
  function personFor(handle) {
    const h = String(handle || '').trim().toLowerCase();
    if (!h) return null;
    return byHandle.value.get(h) || null;
  }

  /**
   * What to print for a handle. Falls back to the handle itself — an unknown
   * seat is shown as the raw handle rather than swallowed, because a comment
   * routed to a role the directory has never heard of is exactly the thing
   * someone needs to see.
   */
  function labelFor(handle) {
    const p = personFor(handle);
    return (p && p.display_name) || String(handle || '').trim();
  }

  /**
   * My own handle, resolved the way the SERVER resolves `assignee: 'me'` —
   * by email against the directory, never guessed from a username.
   *
   * Returns '' when the signed-in account has no directory entry, and the
   * caller is expected to hide the "assigned to me" affordance rather than
   * offer a filter that can only ever match nothing.
   */
  function handleForEmail(email) {
    const want = String(email || '').trim().toLowerCase();
    if (!want) return '';
    const hit = people.value.find(
      (p) => p && p.active && String(p.email || '').trim().toLowerCase() === want,
    );
    return hit ? hit.handle : '';
  }

  /**
   * Fetch once. A failure is recorded and swallowed: the directory decorates
   * the register, and not being able to name the bookkeeper must not stop the
   * comments rendering.
   */
  async function load() {
    if (loading.value || loaded.value) return;
    loading.value = true;
    error.value = '';
    try {
      const data = await getPeople();
      people.value = Array.isArray(data?.results) ? data.results : [];
      loaded.value = true;
    } catch (e) {
      error.value = e?.response?.data?.error || e?.message || 'Could not read the people directory.';
      people.value = [];
    } finally {
      loading.value = false;
    }
  }

  return { people, seats, byHandle, loading, loaded, error, load, personFor, labelFor, handleForEmail };
}
