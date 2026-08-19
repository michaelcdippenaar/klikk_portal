/**
 * useReceiptSelection — bulk-selection state for the Audit → Receipts console.
 *
 * Holds a Set of selected sha256 strings. The Set is ALWAYS replaced with a
 * new Set on change (never mutated in place) so Vue reactivity and KTable's
 * `watch(() => props.selectedRowIds, ...)` both fire on every update.
 *
 * `filterSignature` is a Ref<string> the CALLER computes — a stable
 * serialisation of the current filter state EXCLUDING paging. The selection
 * survives page changes but resets whenever the signature changes (a new
 * filter means a new population; keeping stale sha256s selected would let a
 * bulk action silently hit receipts the user can no longer see).
 *
 * WHY the signature is injected rather than derived in here: the page owns
 * the filter shape (buildApiParams / which keys count as "the filter"), and
 * this composable must stay mountable in a unit test with a plain ref —
 * no router, no page internals, no component imports.
 */

import { ref, computed, watch } from 'vue';

export function useReceiptSelection(filterSignature /* Ref<string> */) {
  const selected = ref(new Set());

  const count = computed(() => selected.value.size);
  const hasSelection = computed(() => count.value > 0);

  /** Replace the selection. Accepts a Set or an array; stores a new Set. */
  function set(next) {
    selected.value = new Set(next ?? []);
  }

  /** Union of the current selection + `ids` (used by "select all N filtered"). */
  function add(ids) {
    const merged = new Set(selected.value);
    for (const id of ids ?? []) merged.add(id);
    selected.value = merged;
  }

  /** Empty the selection. */
  function clear() {
    selected.value = new Set();
  }

  /** Membership test. */
  function has(id) {
    return selected.value.has(id);
  }

  // Selection survives page changes but resets when the filter changes —
  // the caller's signature excludes paging by contract (see doc above).
  watch(filterSignature, () => {
    clear();
  });

  return { selected, count, hasSelection, set, add, clear, has };
}
