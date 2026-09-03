// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import KBadge from '../KBadge.vue';

// KBadge rendered `{{ label }}` and declared no <slot>, while 11 call sites
// across 7 pages passed their text as default slot content -- so those badges
// rendered as EMPTY SPANS, with a "Missing required prop: label" warning per
// render. On the comments register that meant the status of every row and the
// subject-kind label were simply absent from the page.
//
// Every test here asserts on RENDERED TEXT. The 75 mount-based specs on
// AuditComments all passed against the broken component because none of them
// looked at what the badge actually said -- mounting the real page is
// necessary and not sufficient if the assertions skip what the user sees.
describe('KBadge — text actually renders', () => {
  it('renders default slot content', () => {
    const w = mount(KBadge, { slots: { default: 'actioned' } });
    expect(w.text()).toBe('actioned');
    w.unmount();
  });

  it('renders the label prop when there is no slot', () => {
    const w = mount(KBadge, { props: { label: '12 new' } });
    expect(w.text()).toBe('12 new');
    w.unmount();
  });

  it('prefers slot content over the label prop', () => {
    const w = mount(KBadge, { props: { label: 'ignored' }, slots: { default: 'shown' } });
    expect(w.text()).toBe('shown');
    w.unmount();
  });

  it('omitting both is empty but warns about neither', () => {
    const w = mount(KBadge);
    expect(w.text()).toBe('');
    w.unmount();
  });

  it('every tone it accepts has a class the stylesheet defines', () => {
    for (const tone of ['default', 'accent', 'muted']) {
      const w = mount(KBadge, { props: { tone }, slots: { default: 'x' } });
      expect(w.classes()).toContain(`kbadge--${tone}`);
      w.unmount();
    }
  });
});
