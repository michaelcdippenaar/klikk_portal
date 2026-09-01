// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import TenantSelector from '../TenantSelector.vue';
import { DEMO_PREVIEW_ENTITY, useDataStore } from '../../stores/data';

describe('TenantSelector — demo entity', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each(['Enter', ' '])(
    'opens with the %s key and exposes the demo cue only in the dropdown',
    async (key) => {
      const store = useDataStore();
      store.tenants = [DEMO_PREVIEW_ENTITY];
      store.setSelectedTenant(DEMO_PREVIEW_ENTITY.id);
      const wrapper = mount(TenantSelector, { attachTo: document.body });
      const trigger = wrapper.get('button.kdl-tenant-btn');

      expect(trigger.text()).toContain('Klikk (Pty) Ltd');
      expect(trigger.text()).not.toContain('Demo data');

      expect(trigger.element.tagName).toBe('BUTTON');
      expect(trigger.attributes('aria-haspopup')).toBe('dialog');
      await trigger.trigger('keydown', { key });
      await wrapper.vm.$nextTick();

      const option = document.body.querySelector('.kdl-tenant-menu__item');
      expect(trigger.attributes('aria-expanded')).toBe('true');
      expect(option).toBeTruthy();
      expect(option?.textContent).toContain('Klikk (Pty) Ltd');
      expect(option?.textContent).toContain('Demo data');
      expect(option?.getAttribute('aria-pressed')).toBe('true');
      expect(option?.tagName).toBe('BUTTON');

      wrapper.unmount();
    }
  );

  it('still opens with a mouse click', async () => {
    const store = useDataStore();
    store.tenants = [DEMO_PREVIEW_ENTITY];
    store.setSelectedTenant(DEMO_PREVIEW_ENTITY.id);
    const wrapper = mount(TenantSelector, { attachTo: document.body });

    await wrapper.get('button.kdl-tenant-btn').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('.kdl-tenant-menu__item')).toBeTruthy();
    wrapper.unmount();
  });

  it('closes with Escape, updates aria-expanded, and restores focus to the trigger', async () => {
    const store = useDataStore();
    store.tenants = [DEMO_PREVIEW_ENTITY];
    store.setSelectedTenant(DEMO_PREVIEW_ENTITY.id);
    const wrapper = mount(TenantSelector, { attachTo: document.body });
    const trigger = wrapper.get<HTMLButtonElement>('button.kdl-tenant-btn');
    trigger.element.focus();

    await trigger.trigger('keydown', { key: 'Enter' });
    await wrapper.vm.$nextTick();
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });
});
