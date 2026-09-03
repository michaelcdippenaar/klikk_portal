// @vitest-environment happy-dom
/**
 * KSelect.emptyOption.spec — a ""-valued option must render, not detonate.
 *
 * `{ value: '' }` is how every "show me all of them" row on this console is
 * written: "Everyone" on the audit-comments author filter, "Everything" on
 * Kind, "Any" on Verdict, "All mirrors" in FindingCubeView, "—" in
 * utils/receipts.js.
 *
 * reka-ui THROWS on `<SelectItem value="">` — it reserves "" for "cleared,
 * show the placeholder". The throw lands in setup while the option list is
 * being built, so it takes the WHOLE dropdown down, not just that one row, and
 * nothing surfaces where a user would see it: the control simply stops
 * offering choices. MC reported it as "the author filter has no select-all" —
 * the option was in the source the entire time and could never render.
 *
 * KSelect now swaps "" for an internal sentinel on the way in and back on the
 * way out, so callers keep writing the natural `{ value: '' }`.
 */
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import KSelect from '../KSelect.vue';

// happy-dom has no Pointer Capture API, and reka-ui's SelectTrigger opens on
// pointerdown. Without these the dropdown never opens and every assertion
// below passes vacuously.
beforeAll(() => {
  const p = Element.prototype as unknown as Record<string, unknown>;
  p.hasPointerCapture = () => false;
  p.setPointerCapture = () => {};
  p.releasePointerCapture = () => {};
  p.scrollIntoView = () => {};
});

// reka-ui teleports the option list to <body>. Unmount every wrapper between
// tests, or a later test queries a previous test's leftover panel. Unmounting
// (rather than wiping innerHTML) lets Vue tear its own teleport down.
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  document.body.innerHTML = '';
});

const AUTHORS = [
  { label: 'Everyone', value: '' },
  { label: 'MC (To Review)', value: 'MC (To Review)' },
  { label: 'claude:year-end-audit', value: 'claude:year-end-audit' },
];

function mountSelect(props: Record<string, unknown>) {
  const w = mount(KSelect, { props, attachTo: document.body });
  mounted.push(w);
  return w;
}

async function openedItems(props: Record<string, unknown>) {
  const w = mountSelect(props);
  await w.find('.kselect-trigger').trigger('pointerdown', { button: 0, pointerType: 'mouse' });
  await new Promise((r) => setTimeout(r, 150));
  return {
    wrapper: w,
    state: w.find('.kselect-trigger').attributes('data-state'),
    labels: [...document.querySelectorAll('.kselect-item')].map((n) => n.textContent?.trim()),
  };
}

describe('KSelect — an option whose value is the empty string', () => {
  it('opens the dropdown and renders EVERY option, select-all included', async () => {
    const { state, labels } = await openedItems({
      modelValue: '', label: 'Author', options: AUTHORS,
    });
    expect(state).toBe('open');
    // Before the fix this list was empty: the ""-valued row threw during setup
    // and the sibling options went with it.
    expect(labels).toEqual(['Everyone', 'MC (To Review)', 'claude:year-end-audit']);
  });

  it('shows the select-all option as the current selection, not as blank', async () => {
    const w = mountSelect({ modelValue: '', label: 'Author', options: AUTHORS });
    expect(w.find('.kselect-trigger').text()).toContain('Everyone');
  });

  it('emits "" — never the internal sentinel — when select-all is chosen', async () => {
    const { wrapper } = await openedItems({
      modelValue: 'MC (To Review)', label: 'Author', options: AUTHORS,
    });
    const everyone = [...document.querySelectorAll('.kselect-item')]
      .find((n) => n.textContent?.trim() === 'Everyone') as HTMLElement | undefined;
    expect(everyone).toBeTruthy();
    // reka-ui commits the selection on pointerup, not click.
    everyone!.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    // The page reads "" as "no author filter". Leaking the sentinel would
    // filter the register down to nothing.
    expect(emitted!.at(-1)).toEqual(['']);
  });

  it('leaves callers that offer no ""-valued option exactly as they were', async () => {
    const { state, labels } = await openedItems({
      modelValue: '', label: 'Account', placeholder: 'Choose account…',
      options: [{ label: 'MC (To Review)', value: 'MC (To Review)' }],
    });
    expect(state).toBe('open');
    expect(labels).toEqual(['MC (To Review)']);
    // "" with nothing to match still means "nothing picked yet", so no option
    // label is claimed as the selection.
    const w = mountSelect({
      modelValue: '', label: 'Account', placeholder: 'Choose account…',
      options: [{ label: 'MC (To Review)', value: 'MC (To Review)' }],
    });
    expect(w.find('.kselect-trigger').text()).not.toContain('MC (To Review)');
  });
});
