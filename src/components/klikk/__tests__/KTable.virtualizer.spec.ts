/**
 * KTable.virtualizer.spec.ts
 *
 * Regression guard for virtual-scroll rerenders.
 *
 * TanStack Vue Virtual returns a shallow ref and calls triggerRef() as the user
 * scrolls. KTable must use that ref directly in the template. If we wrap it in
 * a computed that returns the same Virtualizer object, Vue sees no identity
 * change and the rendered row window stays stuck at the first rows.
 */

import { describe, expect, it } from 'vitest';
import { computed, effect, shallowRef, triggerRef } from 'vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const ROOT = new URL('../../../../', import.meta.url);
const ktableVue = readFileSync(
  fileURLToPath(new URL('src/components/klikk/KTable.vue', ROOT)),
  'utf-8',
);

function makeMockVirtualizer() {
  return {
    firstIndex: 0,
    getTotalSize: () => 1000 * 32,
    getVirtualItems() {
      return Array.from({ length: 3 }, (_, i) => ({
        index: this.firstIndex + i,
        start: (this.firstIndex + i) * 32,
        size: 32,
        end: (this.firstIndex + i + 1) * 32,
        key: this.firstIndex + i,
        lane: 0,
      }));
    },
  };
}

describe('KTable virtualizer wiring', () => {
  it('uses the TanStack virtualizer ref directly instead of a same-object computed wrapper', () => {
    expect(ktableVue).toContain('const virtualizer = useVirtualizer(');
    expect(ktableVue).not.toContain('_virtualizerRef');
    expect(ktableVue).not.toContain('effectScope');
    expect(ktableVue).not.toContain('computed(() => _virtualizerRef');
  });

  it('rerenders virtual items when the shallow virtualizer ref is triggered', () => {
    const instance = makeMockVirtualizer();
    const virtualizer = shallowRef(instance);
    const renderedFirstIndexes: number[] = [];

    effect(() => {
      renderedFirstIndexes.push(virtualizer.value.getVirtualItems()[0].index);
    });

    instance.firstIndex = 50;
    triggerRef(virtualizer);

    expect(renderedFirstIndexes).toEqual([0, 50]);
  });

  it('documents why a computed wrapper breaks same-object scroll updates', () => {
    const instance = makeMockVirtualizer();
    const virtualizer = shallowRef(instance);
    const wrapped = computed(() => virtualizer.value);
    const renderedFirstIndexes: number[] = [];

    effect(() => {
      renderedFirstIndexes.push(wrapped.value.getVirtualItems()[0].index);
    });

    instance.firstIndex = 50;
    triggerRef(virtualizer);

    expect(renderedFirstIndexes).toEqual([0]);
  });
});
