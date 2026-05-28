/**
 * KTable.scope.spec.ts
 *
 * Guard the virtualizer lifecycle wiring.
 *
 * useVirtualizer() must be called from KTable's setup scope so its internal
 * onScopeDispose cleanup attaches to the component. It should not be created
 * inside watchEffect, and it should not be hidden behind an extra effectScope
 * or computed wrapper that can suppress scroll rerenders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { effectScope, onScopeDispose, shallowRef } from 'vue';

const ROOT = new URL('../../../../', import.meta.url);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8');
}

const ktableVue = readSrc('src/components/klikk/KTable.vue');

describe('KTable virtualizer setup wiring (static source)', () => {
  const scriptMatch = /<script setup>([\s\S]*?)<\/script>/.exec(ktableVue);
  const script = scriptMatch?.[1] ?? '';

  it('calls useVirtualizer directly in setup', () => {
    expect(script).toContain('const virtualizer = useVirtualizer(');
  });

  it('does not create the virtualizer inside watchEffect or a manual effectScope', () => {
    const watchEffectBlocks = script.match(/watchEffect\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\)/g) ?? [];
    for (const block of watchEffectBlocks) {
      expect(block).not.toContain('useVirtualizer');
    }

    expect(script).not.toContain('effectScope');
    expect(script).not.toContain('_virtualizerRef');
    expect(script).not.toContain('onScopeDispose(() => _scope.stop())');
  });

  it('uses the virtualizer enabled option for non-virtual KTable instances', () => {
    expect(script).toContain('enabled: props.virtual');
  });
});

describe('KTable virtualizer setup wiring (scope behavior)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  function makeVirtualizerMock(disposeCallback: () => void) {
    const instance = {
      getTotalSize: () => 4400,
      getVirtualItems: () => [],
    };

    onScopeDispose(disposeCallback);
    return shallowRef(instance);
  }

  it('can attach virtualizer cleanup directly to the component setup scope', () => {
    const disposeSpy = vi.fn();
    const componentScope = effectScope();

    componentScope.run(() => {
      makeVirtualizerMock(disposeSpy);
    });

    const scopeWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('onScopeDispose')
    );
    expect(scopeWarnings).toHaveLength(0);

    expect(disposeSpy).not.toHaveBeenCalled();
    componentScope.stop();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});
