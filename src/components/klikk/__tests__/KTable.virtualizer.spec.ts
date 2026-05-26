/**
 * KTable.virtualizer.spec.ts
 *
 * Tests: virtualizer initialisation — correct shallowRef + watchEffect wiring,
 * not computed-wraps-ref double-wrapping that caused getTotalSize crashes.
 *
 * Strategy: test the reactive wiring logic directly (same pattern as sort / filter /
 * pagination specs). The node environment has no DOM, so we mock useVirtualizer
 * and validate that:
 *   - virtual: false → virtualizer remains null (no initialisation)
 *   - virtual: true  → useVirtualizer is called; the Virtualizer instance (unwrapped)
 *                       is accessible and getTotalSize() returns a number
 *   - reactive toggle (false → true) → virtualizer initialises without throwing
 *
 * The fix being exercised: replacing computed(() => useVirtualizer(...)) with
 * shallowRef + watchEffect + a computed unwrap, so the template receives a
 * Virtualizer instance, not a nested Ref<Virtualizer>.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, shallowRef, computed, watchEffect, nextTick } from 'vue';

// ── Mock Virtualizer instance ─────────────────────────────────────────────────

function makeMockVirtualizer(rowCount: number) {
  return {
    getTotalSize: () => rowCount * 36,
    getVirtualItems: () =>
      Array.from({ length: Math.min(rowCount, 12) }, (_, i) => ({
        index: i,
        start: i * 36,
        size: 36,
        end: i * 36 + 36,
        key: i,
        lane: 0,
      })),
  };
}

// ── Replicate the fixed virtualizer wiring from KTable.vue ──────────────────
//
// This mirrors exactly what KTable does after the fix. We isolate the reactive
// wiring so we can drive it with synthetic props without needing a DOM mount.

function makeVirtualizerWiring(initialVirtual: boolean, rowCount: number) {
  const virtualProp = ref(initialVirtual);
  const rows = ref(Array.from({ length: rowCount }, (_, i) => ({ id: String(i) })));

  // Mocked useVirtualizer: returns Ref<MockVirtualizer> to match the real signature.
  const useVirtualizerMock = vi.fn((opts: { count: number }) => {
    const instance = makeMockVirtualizer(opts.count);
    return ref(instance); // matches Ref<Virtualizer> return type
  });

  // Replicate the fixed shallowRef + watchEffect from KTable.vue
  const _virtualizerRef = shallowRef<ReturnType<typeof ref> | null>(null);

  watchEffect(() => {
    if (!virtualProp.value) {
      _virtualizerRef.value = null;
      return;
    }
    _virtualizerRef.value = useVirtualizerMock({
      count: rows.value.length,
      getScrollElement: () => null,
      estimateSize: () => 36,
      overscan: 10,
    });
  });

  // Replicate the unwrapping computed from KTable.vue
  const virtualizer = computed(() => (_virtualizerRef.value as any)?.value ?? null);

  return { virtualProp, rows, virtualizer, useVirtualizerMock };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('KTable virtualizer wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('virtual: false with 30 rows — virtualizer is null, no initialisation', () => {
    const { virtualizer, useVirtualizerMock } = makeVirtualizerWiring(false, 30);

    // virtualizer should be null; useVirtualizer should never be called
    expect(virtualizer.value).toBeNull();
    expect(useVirtualizerMock).not.toHaveBeenCalled();
  });

  it('virtual: true with virtualHeight 400 and 1000 rows — virtualizer initialised, getTotalSize() > 0, at least 5 virtual items', () => {
    const { virtualizer, useVirtualizerMock } = makeVirtualizerWiring(true, 1000);

    // useVirtualizer should have been called during watchEffect
    expect(useVirtualizerMock).toHaveBeenCalledOnce();

    // The unwrapped instance should be the Virtualizer (not a Ref)
    expect(virtualizer.value).not.toBeNull();
    expect(typeof virtualizer.value.getTotalSize).toBe('function');

    // getTotalSize() must return a positive number
    const totalSize = virtualizer.value.getTotalSize();
    expect(typeof totalSize).toBe('number');
    expect(totalSize).toBeGreaterThan(0);

    // At least 5 virtual items rendered
    const items = virtualizer.value.getVirtualItems();
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it('reactive switch false → true — no crash, virtualizer initialises', async () => {
    const { virtualProp, virtualizer, useVirtualizerMock } = makeVirtualizerWiring(false, 200);

    // Initially null
    expect(virtualizer.value).toBeNull();
    expect(useVirtualizerMock).not.toHaveBeenCalled();

    // Switch to virtual: true — watchEffect flushes asynchronously via Vue scheduler
    virtualProp.value = true;
    await nextTick();

    expect(useVirtualizerMock).toHaveBeenCalledOnce();
    expect(virtualizer.value).not.toBeNull();
    expect(typeof virtualizer.value.getTotalSize).toBe('function');
    expect(virtualizer.value.getTotalSize()).toBeGreaterThan(0);
  });
});
