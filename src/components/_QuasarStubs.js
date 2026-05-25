/**
 * _QuasarStubs.js — Phase 0 migration shim.
 *
 * Globally registers minimal stub components for every Quasar q-* component
 * used in the portal. This keeps the build green while Phase 1+2 migrate
 * templates to the real Reka UI / KDL primitives.
 *
 * Every stub passes through $attrs and renders a <slot /> so nested content
 * is visible and click events still bubble. No styles. No behaviour.
 *
 * Remove this file and its registration in main.js once Phase 2 is complete.
 */

import { defineComponent, h } from 'vue';

// --- stub factory helpers ---------------------------------------------------

function makeStub(tag = 'div') {
  return defineComponent({
    name: `QStub-${tag}`,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default ? slots.default() : []);
    },
  });
}

// Semantic overrides for a few components so DevTools is less confusing
function makeButton() {
  return defineComponent({
    name: 'QBtn',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('button', { type: 'button', ...attrs }, slots.default ? slots.default() : []);
    },
  });
}

function makeInput() {
  return defineComponent({
    name: 'QInput',
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          value: props.modelValue ?? '',
          onInput: (e) => emit('update:modelValue', e.target.value),
          ...attrs,
        });
    },
  });
}

function makeSelect() {
  return defineComponent({
    name: 'QSelect',
    inheritAttrs: false,
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h(
          'select',
          {
            value: props.modelValue ?? '',
            onChange: (e) => emit('update:modelValue', e.target.value),
            ...attrs,
          },
          (props.options ?? []).map((opt) => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : opt;
            return h('option', { value: val }, label);
          }),
        );
    },
  });
}

// --- stub map ---------------------------------------------------------------

const stubMap = {
  // Layout
  QLayout: makeStub('div'),
  QHeader: makeStub('header'),
  QFooter: makeStub('footer'),
  QDrawer: makeStub('aside'),
  QPageContainer: makeStub('main'),
  QPage: makeStub('div'),

  // Toolbar
  QToolbar: makeStub('div'),
  QToolbarTitle: makeStub('span'),
  QSpace: makeStub('span'),

  // Card
  QCard: makeStub('div'),
  QCardSection: makeStub('div'),
  QCardActions: makeStub('div'),

  // Separator
  QSeparator: defineComponent({
    name: 'QSeparator',
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => h('hr', { style: 'border:none;border-top:1px solid currentColor;opacity:.12', ...attrs });
    },
  }),

  // Form controls
  QBtn: makeButton(),
  QBtnGroup: makeStub('div'),
  QBtnDropdown: makeStub('div'),
  QIcon: makeStub('span'),
  QInput: makeInput(),
  QSelect: makeSelect(),
  QCheckbox: defineComponent({
    name: 'QCheckbox',
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          type: 'checkbox',
          checked: !!props.modelValue,
          onChange: (e) => emit('update:modelValue', e.target.checked),
          ...attrs,
        });
    },
  }),
  QToggle: defineComponent({
    name: 'QToggle',
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          type: 'checkbox',
          role: 'switch',
          checked: !!props.modelValue,
          onChange: (e) => emit('update:modelValue', e.target.checked),
          ...attrs,
        });
    },
  }),
  QRadio: defineComponent({
    name: 'QRadio',
    inheritAttrs: false,
    props: ['modelValue', 'val'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          type: 'radio',
          checked: props.modelValue === props.val,
          onChange: () => emit('update:modelValue', props.val),
          ...attrs,
        });
    },
  }),
  QFile: makeStub('div'),
  QForm: makeStub('form'),
  QField: makeStub('div'),
  QOptionGroup: makeStub('div'),
  QSlider: makeStub('div'),
  QRange: makeStub('div'),
  QRating: makeStub('div'),
  QEditor: makeStub('div'),

  // Feedback
  QSpinner: makeStub('span'),
  QSpinnerDots: makeStub('span'),
  QSpinnerBall: makeStub('span'),
  QSkeletonLoader: makeStub('div'),
  QLinearProgress: defineComponent({
    name: 'QLinearProgress',
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => h('progress', { style: 'width:100%', ...attrs });
    },
  }),
  QCircularProgress: makeStub('span'),
  QInnerLoading: makeStub('div'),
  QBanner: makeStub('div'),

  // Display
  QBadge: makeStub('span'),
  QChip: makeStub('span'),
  QAvatar: makeStub('div'),
  QImg: defineComponent({
    name: 'QImg',
    inheritAttrs: false,
    props: ['src', 'alt'],
    setup(props, { attrs }) {
      return () => h('img', { src: props.src, alt: props.alt ?? '', ...attrs });
    },
  }),

  // Overlays / popups
  QDialog: makeStub('div'),
  QMenu: makeStub('div'),
  QTooltip: makeStub('span'),
  QPopupProxy: makeStub('div'),

  // List / tree
  QList: makeStub('ul'),
  QItem: makeStub('li'),
  QItemSection: makeStub('div'),
  QItemLabel: makeStub('span'),
  QExpansionItem: makeStub('div'),
  QVirtualScroll: makeStub('div'),

  // Table
  QTable: makeStub('table'),
  QTr: makeStub('tr'),
  QTh: makeStub('th'),
  QTd: makeStub('td'),
  QMarkupTable: makeStub('table'),

  // Tabs
  QTabs: makeStub('div'),
  QTab: makeStub('button'),
  QRouteTab: makeStub('button'),
  QTabPanels: makeStub('div'),
  QTabPanel: makeStub('div'),

  // Scroll
  QScrollArea: makeStub('div'),
  QScrollObserver: makeStub('div'),

  // Miscellaneous
  QVideo: makeStub('div'),
  QTimeline: makeStub('div'),
  QTimelineEntry: makeStub('div'),
  QStepper: makeStub('div'),
  QStep: makeStub('div'),
  QStepperNavigation: makeStub('div'),
  QKnob: makeStub('div'),
  QDate: makeStub('div'),
  QTime: makeStub('div'),
  QNoSsr: makeStub('div'),
  QResizeObserver: makeStub('div'),
  QIntersection: makeStub('div'),
  QSpace2: makeStub('span'),
};

/**
 * Register all stub components on the given Vue app instance.
 * @param {import('vue').App} app
 */
export function registerQuasarStubs(app) {
  for (const [name, component] of Object.entries(stubMap)) {
    app.component(name, component);
  }
}

/**
 * Stub composable — replaces `import { useQuasar } from 'quasar'` at call sites
 * that have been updated to import from this module instead.
 * The five pages still importing from 'quasar' directly are handled by the
 * aliased module shim below (see vite.config.js alias: 'quasar' → this file).
 */
export function useQuasar() {
  return {
    notify: () => {},
    dark: { isActive: false, set: () => {} },
    dialog: () => ({ onOk: () => {}, onCancel: () => {}, onDismiss: () => {} }),
    loading: { show: () => {}, hide: () => {} },
    platform: { is: {} },
    screen: { width: 0, height: 0 },
  };
}

// Named exports matching what pages import from 'quasar' — allows the vite alias
// to point 'quasar' at this file without breaking named imports.
export const Notify = { create: () => {} };
export const Dialog = { create: () => {} };
export const Loading = { show: () => {}, hide: () => {} };
