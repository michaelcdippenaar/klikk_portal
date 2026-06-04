// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SwitchRoot } from 'reka-ui';
import KToggle from '../KToggle.vue';

// process.cwd() is the repo root under vitest; URL/import.meta.url can't be used
// here because the happy-dom env makes import.meta.url an http:// URL.
const src = readFileSync(
  path.join(process.cwd(), 'src/components/klikk/KToggle.vue'),
  'utf-8',
);

// Regression: KToggle previously bound Reka's SwitchRoot via `:checked` /
// `@update:checked`, which DO NOT EXIST in reka-ui (SwitchRoot uses
// modelValue / update:modelValue). The result was a dead toggle: the bound
// value never controlled the switch and a click never wrote back — so e.g.
// "Suppress zeros" looked toggleable but never changed anything. These tests
// lock the correct binding at both the source and rendered-behaviour level.
describe('KToggle — Reka SwitchRoot v-model binding', () => {
  it('binds SwitchRoot via model-value / update:model-value (Reka API), not the non-existent :checked / @update:checked', () => {
    expect(src).toContain(':model-value="modelValue"');
    expect(src).toContain('@update:model-value=');
    expect(src).not.toContain(':checked="modelValue"');
    expect(src).not.toContain('@update:checked');
  });

  it('reflects modelValue in the rendered switch (controlled mode) — the broken :checked binding rendered uncontrolled/off', () => {
    const on = mount(KToggle, { props: { modelValue: true, label: 'X' } });
    const sw = on.get('[role="switch"]');
    expect(sw.attributes('aria-checked')).toBe('true');
    expect(sw.attributes('data-state')).toBe('checked');

    const off = mount(KToggle, { props: { modelValue: false, label: 'X' } });
    expect(off.get('[role="switch"]').attributes('aria-checked')).toBe('false');
  });

  it('updates the rendered switch when modelValue changes (prop is reactive into Reka)', async () => {
    const w = mount(KToggle, { props: { modelValue: false } });
    expect(w.get('[role="switch"]').attributes('aria-checked')).toBe('false');
    await w.setProps({ modelValue: true });
    expect(w.get('[role="switch"]').attributes('aria-checked')).toBe('true');
  });

  it('re-emits update:modelValue when SwitchRoot reports a change (write-back to the parent v-model)', async () => {
    const w = mount(KToggle, { props: { modelValue: false } });
    // Reka SwitchRoot emits update:modelValue on toggle; KToggle must forward it.
    w.findComponent(SwitchRoot).vm.$emit('update:modelValue', true);
    await w.vm.$nextTick();
    expect(w.emitted('update:modelValue')).toBeTruthy();
    expect(w.emitted('update:modelValue').at(-1)).toEqual([true]);
  });
});
