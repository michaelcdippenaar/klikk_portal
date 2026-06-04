// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CheckboxRoot } from 'reka-ui';
import KCheckbox from '../KCheckbox.vue';

// process.cwd() is the repo root under vitest; URL/import.meta.url can't be used
// here because the happy-dom env makes import.meta.url an http:// URL.
const src = readFileSync(
  path.join(process.cwd(), 'src/components/klikk/KCheckbox.vue'),
  'utf-8',
);

// Regression (twin of the KToggle bug): KCheckbox bound Reka's CheckboxRoot via
// `:checked` / `@update:checked`, which DO NOT EXIST in reka-ui 2.9.8
// (CheckboxRoot uses modelValue / update:modelValue). The result was a dead
// checkbox — the bound value never controlled it and a click never wrote back,
// so e.g. the Set Editor's member checkboxes could not select consolidations (or
// anything). These tests lock the correct binding at source + rendered level.
describe('KCheckbox — Reka CheckboxRoot v-model binding', () => {
  it('binds CheckboxRoot via model-value / update:model-value (Reka API), not the non-existent :checked / @update:checked', () => {
    expect(src).toContain(':model-value="modelValue"');
    expect(src).toContain('@update:model-value=');
    expect(src).not.toContain(':checked="modelValue"');
    expect(src).not.toContain('@update:checked');
  });

  it('reflects modelValue in the rendered checkbox (controlled mode) — the broken :checked binding rendered uncontrolled/unchecked', () => {
    const on = mount(KCheckbox, { props: { modelValue: true, label: 'X' } });
    const box = on.get('[role="checkbox"]');
    expect(box.attributes('aria-checked')).toBe('true');
    expect(box.attributes('data-state')).toBe('checked');

    const off = mount(KCheckbox, { props: { modelValue: false, label: 'X' } });
    expect(off.get('[role="checkbox"]').attributes('aria-checked')).toBe('false');
  });

  it('updates the rendered checkbox when modelValue changes (prop is reactive into Reka)', async () => {
    const w = mount(KCheckbox, { props: { modelValue: false } });
    expect(w.get('[role="checkbox"]').attributes('aria-checked')).toBe('false');
    await w.setProps({ modelValue: true });
    expect(w.get('[role="checkbox"]').attributes('aria-checked')).toBe('true');
  });

  it('re-emits update:modelValue when CheckboxRoot reports a change (write-back to the parent v-model)', async () => {
    const w = mount(KCheckbox, { props: { modelValue: false } });
    w.findComponent(CheckboxRoot).vm.$emit('update:modelValue', true);
    await w.vm.$nextTick();
    expect(w.emitted('update:modelValue')).toBeTruthy();
    expect(w.emitted('update:modelValue').at(-1)).toEqual([true]);
  });
});
