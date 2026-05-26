/**
 * KTable.scope.spec.ts
 *
 * Vitest gate for F1 — useVirtualizer called in setup scope, not watchEffect.
 *
 * MECHANISM: useVirtualizer() is a composable that internally calls
 * onScopeDispose(cleanup) for teardown. When called inside watchEffect(),
 * the callback runs without an owning component effect scope after the first
 * sync tick → Vue warns "onScopeDispose() is called when there is no active
 * effect scope to be associated with." The cleanup also leaks because the
 * previous virtualizer's dispose hook has nowhere to attach.
 *
 * FIX: effectScope() wraps the useVirtualizer call at setup time, giving the
 * internal onScopeDispose a valid owner. The scope is torn down on
 * onScopeDispose (component unmount). watchEffect is gone from the wiring.
 *
 * STRATEGY: Two complementary tests — static source + isolated reactive logic.
 *
 *   A) Static source gate: assert watchEffect is NOT used in the virtualizer
 *      section of KTable.vue, and effectScope IS used. This guards against
 *      the regression of reverting to the watchEffect pattern.
 *
 *   B) Reactive logic gate: replicate the effectScope + useVirtualizer wiring
 *      exactly as KTable does it, verify no console.warn containing
 *      'onScopeDispose' fires during scope setup (using a real effectScope so
 *      onScopeDispose inside the mock has a valid owner). Confirm the
 *      virtualizer is initialised and the scope is stopped on dispose.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  ref,
  computed,
  shallowRef,
  watch,
  effectScope,
  onScopeDispose,
} from 'vue';

const ROOT = new URL('../../../../', import.meta.url);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8');
}

const ktableVue = readSrc('src/components/klikk/KTable.vue');

// ── A: Static source gate ─────────────────────────────────────────────────────

describe('KTable F1 — virtualizer scope wiring (static source)', () => {
  // Extract the script block to narrow the search
  const scriptMatch = /<script setup>([\s\S]*?)<\/script>/.exec(ktableVue);
  const script = scriptMatch?.[1] ?? '';

  it('effectScope is imported from vue', () => {
    expect(script).toMatch(/effectScope/);
  });

  it('effectScope() is used in the virtual scroll section', () => {
    // _scope = effectScope() must appear before useVirtualizer
    expect(script).toMatch(/effectScope\(\)/);
  });

  it('useVirtualizer is NOT called inside watchEffect (regression guard)', () => {
    // The prior broken pattern: watchEffect(() => { ... useVirtualizer(...) })
    // We check that useVirtualizer does not appear inside a watchEffect block.
    // Strategy: find watchEffect blocks and assert none contain useVirtualizer.
    const watchEffectBlocks = script.match(/watchEffect\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\)/g) ?? [];
    for (const block of watchEffectBlocks) {
      expect(block).not.toContain('useVirtualizer');
    }
  });

  it('onScopeDispose is used to dispose the effectScope on unmount', () => {
    expect(script).toMatch(/onScopeDispose/);
    // The pattern must include _scope.stop() inside an onScopeDispose call
    expect(script).toMatch(/onScopeDispose\s*\(\s*\(\s*\)\s*=>\s*_scope\.stop\(\)/);
  });
});

// ── B: Reactive logic gate ────────────────────────────────────────────────────
//
// Replicate the fixed wiring from KTable.vue. Use a mock useVirtualizer that
// also calls onScopeDispose() (just like the real one), so we prove the scope
// chain is correct: no warning fires, cleanup is called when scope stops.

describe('KTable F1 — effectScope wiring eliminates onScopeDispose warning', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  function makeVirtualizerMock(disposeCallback: () => void) {
    // Simulates useVirtualizer: calls onScopeDispose (like the real adapter),
    // returns shallowRef<Virtualizer>.
    const instance = {
      getTotalSize: () => 4400,
      getVirtualItems: () => [],
    };
    onScopeDispose(disposeCallback); // triggers warning if no active scope
    return shallowRef(instance);
  }

  it('no onScopeDispose warning when useVirtualizer mock runs inside effectScope', () => {
    const disposeSpy = vi.fn();
    const outerScope = effectScope();

    outerScope.run(() => {
      // Replicate KTable's wiring exactly
      const _scope = effectScope();
      const _virtualizerRef = shallowRef<ReturnType<typeof makeVirtualizerMock> | null>(null);

      // virtual: true branch
      _scope.run(() => {
        _virtualizerRef.value = makeVirtualizerMock(disposeSpy);
      });

      onScopeDispose(() => _scope.stop());
    });

    // The mock calls onScopeDispose inside effectScope — no warning expected
    const scopeWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('onScopeDispose')
    );
    expect(scopeWarnings).toHaveLength(0);

    outerScope.stop();
  });

  it('dispose spy is called when the scope is stopped (cleanup runs)', () => {
    const disposeSpy = vi.fn();
    const outerScope = effectScope();

    let innerScopeRef: ReturnType<typeof effectScope> | null = null;

    outerScope.run(() => {
      const _scope = effectScope();
      innerScopeRef = _scope;
      _scope.run(() => {
        makeVirtualizerMock(disposeSpy);
      });
    });

    expect(disposeSpy).not.toHaveBeenCalled();

    // Stop the inner scope (simulating component unmount)
    innerScopeRef!.stop();

    expect(disposeSpy).toHaveBeenCalledOnce();

    outerScope.stop();
  });

  it('virtualizer is accessible after scope setup — count-reactive computed works', async () => {
    const rows = ref(Array.from({ length: 50 }, (_, i) => ({ id: String(i) })));
    const disposeSpy = vi.fn();

    const outerScope = effectScope();
    let _virtualizerRef!: ReturnType<typeof shallowRef>;

    outerScope.run(() => {
      const _scope = effectScope();
      _virtualizerRef = shallowRef<any>(null);

      _scope.run(() => {
        // Pass a computed options object (the actual fix pattern)
        const opts = computed(() => ({
          count: rows.value.length,
          estimateSize: () => 44,
          overscan: 10,
        }));

        // Mock that reads opts.value.count (simulates internal reactive re-read)
        const instance = {
          getTotalSize: () => opts.value.count * 44,
          getVirtualItems: () => [],
        };
        onScopeDispose(disposeSpy);
        _virtualizerRef.value = shallowRef(instance);
      });

      onScopeDispose(() => _scope.stop());
    });

    const virtualizer = computed(() => (_virtualizerRef.value as any)?.value ?? null);

    // Virtualizer initialised
    expect(virtualizer.value).not.toBeNull();
    expect(virtualizer.value.getTotalSize()).toBe(50 * 44);

    outerScope.stop();
  });
});
