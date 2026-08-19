/**
 * useReceiptSelection.spec.ts — adversarial unit spec for the bulk-selection
 * composable behind Audit → Receipts.
 *
 * The single most load-bearing property here is IDENTITY: every mutator must
 * REPLACE the internal Set rather than mutate it in place. KTable syncs its
 * checkbox state through `watch(() => props.selectedRowIds, ...)`, and a
 * watcher on a Set that is mutated in place never fires — the checkboxes
 * would silently stop tracking the selection. That property is asserted
 * directly (object identity across set / add / clear), not inferred.
 *
 * Also nailed down:
 *   - the filter-signature contract: a CHANGED signature clears the selection
 *     (new filter = new population), an IDENTICAL re-assignment does NOT (a
 *     re-render / identical refetch must not wipe a 200-item selection —
 *     Vue watchers don't fire on identical primitives, proven here);
 *   - hostile inputs (set(null), add(undefined)) never throw;
 *   - add() unions and de-duplicates rather than replacing.
 *
 * No mount, no router — the composable's documented contract is that it works
 * with a plain Ref<string>.
 */

import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useReceiptSelection } from '../useReceiptSelection';

/** 64-char pseudo-sha256, like the real register keys. */
const sha = (seed: string) => seed.repeat(64).slice(0, 64);

const SHA_A = sha('a');
const SHA_B = sha('b');
const SHA_C = sha('c');

function make(signature = 'sig-0') {
  const filterSignature = ref(signature);
  const selection = useReceiptSelection(filterSignature);
  return { filterSignature, selection };
}

describe('useReceiptSelection — initial state', () => {
  it('starts empty: count 0, hasSelection false, has() false for anything', () => {
    const { selection } = make();
    expect(selection.selected.value).toBeInstanceOf(Set);
    expect(selection.selected.value.size).toBe(0);
    expect(selection.count.value).toBe(0);
    expect(selection.hasSelection.value).toBe(false);
    expect(selection.has(SHA_A)).toBe(false);
  });
});

describe('useReceiptSelection — set()', () => {
  it('accepts an array', () => {
    const { selection } = make();
    selection.set([SHA_A, SHA_B]);
    expect(selection.count.value).toBe(2);
    expect(selection.hasSelection.value).toBe(true);
    expect(selection.has(SHA_A)).toBe(true);
    expect(selection.has(SHA_B)).toBe(true);
    expect(selection.has(SHA_C)).toBe(false);
  });

  it('accepts a Set (what KTable actually emits)', () => {
    const { selection } = make();
    selection.set(new Set([SHA_B, SHA_C]));
    expect(selection.count.value).toBe(2);
    expect(selection.has(SHA_B)).toBe(true);
    expect(selection.has(SHA_C)).toBe(true);
    expect(selection.has(SHA_A)).toBe(false);
  });

  it('replaces rather than merges', () => {
    const { selection } = make();
    selection.set([SHA_A]);
    selection.set([SHA_B]);
    expect(selection.count.value).toBe(1);
    expect(selection.has(SHA_A)).toBe(false);
    expect(selection.has(SHA_B)).toBe(true);
  });
});

describe('useReceiptSelection — Set identity (the property KTable depends on)', () => {
  it('set / add / clear each REPLACE the Set with a new object — never mutate in place', () => {
    const { selection } = make();

    const s0 = selection.selected.value;
    selection.set([SHA_A]);
    const s1 = selection.selected.value;
    expect(s1).not.toBe(s0);
    expect(s0.size).toBe(0); // the old Set was left untouched

    selection.add([SHA_B]);
    const s2 = selection.selected.value;
    expect(s2).not.toBe(s1);
    expect(s1.has(SHA_B)).toBe(false); // add() did not mutate the previous Set
    expect(s1.size).toBe(1);

    selection.clear();
    const s3 = selection.selected.value;
    expect(s3).not.toBe(s2);
    expect(s3.size).toBe(0);
    expect(s2.size).toBe(2); // clear() did not empty the previous Set in place
  });

  it('set() with a Set input stores a COPY, not the caller\'s object — later external mutation cannot leak in', () => {
    const { selection } = make();
    const external = new Set([SHA_A]);
    selection.set(external);
    expect(selection.selected.value).not.toBe(external);
    external.add(SHA_B);
    expect(selection.count.value).toBe(1);
    expect(selection.has(SHA_B)).toBe(false);
  });
});

describe('useReceiptSelection — add()', () => {
  it('unions with the current selection rather than replacing it', () => {
    const { selection } = make();
    selection.set([SHA_A]);
    selection.add([SHA_B, SHA_C]);
    expect(selection.count.value).toBe(3);
    expect(selection.has(SHA_A)).toBe(true);
    expect(selection.has(SHA_B)).toBe(true);
    expect(selection.has(SHA_C)).toBe(true);
  });

  it('de-duplicates: adding already-selected ids does not grow the count', () => {
    const { selection } = make();
    selection.set([SHA_A, SHA_B]);
    selection.add([SHA_A, SHA_A, SHA_B]);
    expect(selection.count.value).toBe(2);
  });
});

describe('useReceiptSelection — hostile inputs never throw', () => {
  it('add(undefined) / add(null) are no-ops', () => {
    const { selection } = make();
    selection.set([SHA_A]);
    expect(() => selection.add(undefined)).not.toThrow();
    expect(() => selection.add(null)).not.toThrow();
    expect(selection.count.value).toBe(1);
    expect(selection.has(SHA_A)).toBe(true);
  });

  it('set(null) / set(undefined) empty the selection without throwing', () => {
    const { selection } = make();
    selection.set([SHA_A, SHA_B]);
    expect(() => selection.set(null)).not.toThrow();
    expect(selection.count.value).toBe(0);
    selection.set([SHA_A]);
    expect(() => selection.set(undefined)).not.toThrow();
    expect(selection.count.value).toBe(0);
    expect(selection.hasSelection.value).toBe(false);
  });
});

describe('useReceiptSelection — filter-signature contract', () => {
  it('changing the signature clears the selection (after nextTick — it is a watcher)', async () => {
    const { filterSignature, selection } = make('{"fy":"FY26"}');
    selection.set([SHA_A, SHA_B]);
    expect(selection.count.value).toBe(2);

    filterSignature.value = '{"fy":"FY27"}';
    await nextTick();

    expect(selection.count.value).toBe(0);
    expect(selection.hasSelection.value).toBe(false);
  });

  it('re-assigning the SAME signature string does NOT clear — an identical refetch/re-render must not wipe the selection', async () => {
    const { filterSignature, selection } = make('{"fy":"FY26"}');
    selection.set([SHA_A, SHA_B]);

    // Same primitive value: Vue's ref setter short-circuits, the watcher never
    // fires, the selection survives. This is what makes paging safe — the
    // page recomputes the signature on every fetch, and only a REAL filter
    // change may reset the user's selection.
    filterSignature.value = '{"fy":"FY26"}';
    await nextTick();
    expect(selection.count.value).toBe(2);

    // And a same-value re-assignment built at runtime (different string
    // object, equal primitive) — still no clear.
    filterSignature.value = ['{"fy"', '"FY26"}'].join(':');
    await nextTick();
    expect(selection.count.value).toBe(2);
    expect(selection.has(SHA_A)).toBe(true);
  });

  it('a signature change clears even a large (500-id) selection', async () => {
    const { filterSignature, selection } = make('sig-A');
    const many = Array.from({ length: 500 }, (_, i) => `${String(i).padStart(8, '0')}${'f'.repeat(56)}`);
    selection.set(many);
    expect(selection.count.value).toBe(500);

    filterSignature.value = 'sig-B';
    await nextTick();

    expect(selection.count.value).toBe(0);
    expect(selection.selected.value.size).toBe(0);
  });

  it('the clear caused by a signature change also swaps the Set identity (KTable will see it)', async () => {
    const { filterSignature, selection } = make('sig-A');
    selection.set([SHA_A]);
    const before = selection.selected.value;

    filterSignature.value = 'sig-B';
    await nextTick();

    expect(selection.selected.value).not.toBe(before);
    expect(before.size).toBe(1); // old Set untouched
  });
});
