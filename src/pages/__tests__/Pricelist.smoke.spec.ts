// @vitest-environment happy-dom
/**
 * Pricelist.smoke.spec.ts
 *
 * REAL MOUNT of src/pages/Pricelist.vue (adversarial).
 *
 * Strategy: mount the page with a real memory router (so KTabs' ?tab= sync is
 * genuinely exercised) and the real klikk primitives (KTable / KTabs / KDialog /
 * KSelect / KInput / KAlert / …). Only the API module is mocked. Data shapes
 * mirror the backend contract: money as 2-decimal STRINGS, nullable
 * current_price / last_changed / customer_price / xero_purchase_line, mixed
 * `active`, qty_owned 0, a very long name, a code that needs URL-encoding.
 *
 * Every assertion is on observable DOM. Nothing asserts on the SFC source.
 * If a test here fails, that is a page bug — do not weaken the test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { SelectRoot } from 'reka-ui';

vi.mock('@/api/pricelist', () => ({
  getPriceListItems: vi.fn(),
  getPriceHistory: vi.fn(),
  setPrice: vi.fn(),
  buildQuote: vi.fn(),
  downloadExport: vi.fn(),
  getExportUrl: vi.fn(() => '/api/pricelist/export/'),
}));

import {
  getPriceListItems,
  getPriceHistory,
  setPrice,
  buildQuote,
  downloadExport,
} from '@/api/pricelist';
import Pricelist from '../Pricelist.vue';
import KInput from '../../components/klikk/KInput.vue';
import KSelect from '../../components/klikk/KSelect.vue';

const mockedItems = vi.mocked(getPriceListItems);
const mockedHistory = vi.mocked(getPriceHistory);
const mockedSetPrice = vi.mocked(setPrice);
const mockedQuote = vi.mocked(buildQuote);
const mockedExport = vi.mocked(downloadExport);

// ── Fixtures — production-shaped ────────────────────────────────────────────

const AURRAS_ID = '1f4a93c8-b49a-46da-a7fc-25bafd5fb2b9';
const LONG_NAME =
  'LED video wall panel P3.9 indoor 500 x 500 mm incl. flight case, rigging bar, ' +
  'data + power link cables and spare modules (hire-only, technician required on site)';

interface Item {
  code: string;
  name: string;
  category: string;
  unit: string;
  qty_owned: number | null;
  description: string;
  active: boolean;
  xero_account_code: string | null;
  xero_tracking_option_id: string | null;
  xero_purchase_line_id: string | null;
  xero_purchase_line: { invoice_number: string; description: string; line_amount: string; account_code: string } | null;
  xero_fixed_asset_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  current_price: string | null;
  current_price_valid_from: string | null;
  last_changed: string | null;
  price_count: number;
  customer_price: string | null;
  customer_price_type: string | null;
}

function baseItem(over: Partial<Item>): Item {
  return {
    code: 'X',
    name: 'x',
    category: 'Misc',
    unit: 'each',
    qty_owned: 1,
    description: '',
    active: true,
    xero_account_code: '200',
    xero_tracking_option_id: null,
    xero_purchase_line_id: null,
    xero_purchase_line: null,
    xero_fixed_asset_id: null,
    notes: null,
    created_at: '2026-01-01T08:00:00+02:00',
    updated_at: '2026-01-01T08:00:00+02:00',
    current_price: '0.00',
    current_price_valid_from: '2026-01-01',
    last_changed: '2026-01-01',
    price_count: 1,
    customer_price: null,
    customer_price_type: null,
    ...over,
  };
}

const ITEMS: Item[] = [
  baseItem({
    code: 'DB-V10P', name: 'd&b V10P, yoke and pole', category: 'Audio', unit: 'day', qty_owned: 8,
    current_price: '1400.00', current_price_valid_from: '2026-03-01', last_changed: '2026-03-01', price_count: 3,
    customer_price: '1200.00', customer_price_type: 'TRADE',
    xero_purchase_line_id: 'pl-1',
    xero_purchase_line: { invoice_number: 'INV-0091', description: 'd&b V10P', line_amount: '98000.00', account_code: '1500' },
  }),
  baseItem({
    code: 'LX/PAR 64', name: 'Par 64 "long-nose" can', category: 'Lighting', unit: 'day', qty_owned: 24,
    current_price: '85.00', current_price_valid_from: '2025-11-01', last_changed: null, price_count: 1,
    customer_price: null, customer_price_type: null, xero_purchase_line: null,
  }),
  baseItem({
    code: 'STG-DECK-2X1', name: 'Stage deck 2 m x 1 m', category: 'Staging', unit: 'day', qty_owned: 0,
    current_price: '120.00', last_changed: '2026-02-10', customer_price: '120.00', customer_price_type: 'LIST',
  }),
  baseItem({
    code: 'AV-LED-P3', name: LONG_NAME, category: 'Video', unit: 'sqm/day', qty_owned: 40,
    current_price: '14000.00', last_changed: '2026-06-30', active: false,
    customer_price: '12500.00', customer_price_type: 'SPECIAL',
  }),
  baseItem({
    code: 'PWR-DIST-63A', name: 'Power distro 63A 3-phase', category: 'Power', unit: 'day', qty_owned: 3,
    current_price: null, current_price_valid_from: null, last_changed: null, price_count: 0,
    customer_price: null, customer_price_type: null,
  }),
  baseItem({
    code: 'CAB-XLR-10', name: 'XLR cable 10 m', category: 'Cables', unit: 'day', qty_owned: 60,
    current_price: '15.50', last_changed: '2024-12-01', customer_price: '12.00', customer_price_type: 'SPECIAL',
  }),
  baseItem({
    code: 'RIG-TRUSS-3M', name: 'Truss 290 mm 3 m', category: 'Rigging', unit: 'day', qty_owned: null,
    current_price: '250.00', last_changed: '2026-01-15',
  }),
];

const CATEGORIES = ['Audio', 'Cables', 'Lighting', 'Power', 'Rigging', 'Staging', 'Video'];

function listResponse(items: Item[] = ITEMS, customer: { contacts_id: string; name: string } | null = null) {
  return { count: items.length, categories: CATEGORIES, customer, items };
}

const QUOTE_RESPONSE = {
  date: '2026-08-19',
  customer_id: null,
  customer_name: null,
  vat_rate: '0.15',
  discount_pct: '10.00',
  lines: [
    { code: 'DB-V10P', name: 'd&b V10P, yoke and pole', unit: 'day', category: 'Audio', qty: 4, days: 2, unit_price: '1400.00', price_type: 'LIST', priced: true, line_total: '11200.00', valid_from: '2026-03-01', note: null },
    { code: 'LX/PAR 64', name: 'Par 64 "long-nose" can', unit: 'day', category: 'Lighting', qty: 10, days: 1, unit_price: '85.00', price_type: 'LIST', priced: true, line_total: '850.00', valid_from: '2025-11-01', note: null },
    { code: 'PWR-DIST-63A', name: 'Power distro 63A 3-phase', unit: 'day', category: 'Power', qty: 1, days: 2, unit_price: null, price_type: null, priced: false, line_total: '0.00', valid_from: null, note: 'No price on 2026-08-19' },
  ],
  subtotal: '12050.00',
  discount: '1205.00',
  ex_vat: '10845.00',
  vat: '1626.75',
  incl_vat: '12471.75',
  warnings: [
    'PWR-DIST-63A has no price effective 2026-08-19 — line left unpriced',
    'Discount of 10% applied before VAT',
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const zar = (v: string | number) =>
  'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mounted: VueWrapper[] = [];
let router: Router;

async function mountPage(query: Record<string, string> = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/pricelist', name: 'pricelist', component: Pricelist }],
  });
  await router.push({ path: '/pricelist', query });
  await router.isReady();
  const wrapper = mount(Pricelist, {
    attachTo: document.body,
    global: { plugins: [router] },
  });
  mounted.push(wrapper);
  await flushPromises();
  await nextTick();
  return wrapper;
}

function bodyRows(wrapper: VueWrapper) {
  return wrapper.findAll('.ktable-tbody tr');
}

function rowByCode(wrapper: VueWrapper, code: string) {
  const row = bodyRows(wrapper).find((r) => r.text().includes(code));
  if (!row) throw new Error(`No rendered row for ${code}`);
  return row;
}

function buttonByText(wrapper: VueWrapper, text: string) {
  const b = wrapper.findAll('button').find((x) => x.text().trim().startsWith(text));
  if (!b) throw new Error(`No button "${text}" in page DOM`);
  return b;
}

function dialogEl(): HTMLElement | null {
  return document.querySelector('.kd-content');
}

function dialogButton(text: string) {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>('.kd-content button'))
    .find((b) => (b.textContent || '').trim().startsWith(text));
  if (!el) throw new Error(`No dialog button "${text}"`);
  return new DOMWrapper(el);
}

function inputByLabel(wrapper: VueWrapper, label: string) {
  const c = wrapper.findAllComponents(KInput).find((k) => k.props('label') === label);
  if (!c) throw new Error(`No KInput labelled "${label}"`);
  return c;
}

function selectByLabel(wrapper: VueWrapper, label: string) {
  const c = wrapper.findAllComponents(KSelect).find((k) => k.props('label') === label);
  if (!c) throw new Error(`No KSelect labelled "${label}"`);
  return c;
}

/** Drive a KSelect through Reka's SelectRoot → KSelect.onSelect → v-model. */
async function chooseInSelect(select: VueWrapper, value: string) {
  select.findComponent(SelectRoot).vm.$emit('update:modelValue', value);
  await flushPromises();
  await nextTick();
}

async function goToQuoteTab(wrapper: VueWrapper) {
  const tab = wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Quote builder'));
  if (!tab) throw new Error('No Quote builder tab');
  await tab.trigger('click');
  await flushPromises();
  await nextTick();
}

async function pickLineItem(wrapper: VueWrapper, code: string, lineIndex = 0) {
  const lines = wrapper.findAll('.pl-line');
  const line = lines[lineIndex];
  if (!line) throw new Error(`No quote line at index ${lineIndex}`);
  const sel = wrapper.findAllComponents(KSelect).find((k) => k.element === line.find('.pl-line__item').element);
  if (!sel) throw new Error('No item KSelect in quote line');
  await chooseInSelect(sel, code);
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockedItems.mockReset();
  mockedHistory.mockReset();
  mockedSetPrice.mockReset();
  mockedQuote.mockReset();
  mockedExport.mockReset();
  mockedItems.mockResolvedValue(listResponse());
  // The page console.error()s every caught API error; silence so the run stays clean.
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  document.body.innerHTML = '';
  errorSpy.mockRestore();
});

// ── Rate-card tab ───────────────────────────────────────────────────────────

describe('Pricelist — rate card (real mount)', () => {
  it('renders one data row per item and shows the codes', async () => {
    const w = await mountPage();
    expect(w.text()).toContain('DB-V10P');
    expect(w.text()).toContain('LX/PAR 64');
    expect(bodyRows(w)).toHaveLength(ITEMS.length);
    expect(w.text()).toContain(`Showing ${ITEMS.length} of ${ITEMS.length} items`);
  });

  it('loads with active=true by default (Active only ticked) and no customer', async () => {
    await mountPage();
    expect(mockedItems).toHaveBeenCalled();
    const firstArgs = mockedItems.mock.calls[0][0] as Record<string, unknown>;
    expect(firstArgs.active).toBe('true');
    expect(firstArgs.customer).toBeUndefined();
    expect(firstArgs.category).toBeUndefined();
  });

  it('renders list prices formatted as ZAR with 2 decimals, and the null-price row as the em-dash (never NaN/null/undefined)', async () => {
    const w = await mountPage();
    const v10 = rowByCode(w, 'DB-V10P');
    const v10Price = v10.findAll('td')[5].text().trim();
    expect(v10Price).toBe(zar('1400.00'));
    // \u00a0 / \u202f written as escapes, not literal characters: eslint no-irregular-whitespace
    // fails the build on a raw NBSP, and en-ZA grouping emits one.
    expect(v10Price).toMatch(/^R \d[\d\s\u00a0\u202f.,]*[.,]\d{2}$/);

    const distro = rowByCode(w, 'PWR-DIST-63A');
    const priceCell = distro.findAll('td')[5];
    expect(priceCell.text().trim()).toBe('—');
    expect(distro.text()).not.toMatch(/NaN|null|undefined/);
    expect(w.text()).not.toMatch(/NaN/);
  });

  it('renders the em-dash for a null last_changed and a null qty_owned, and "0" for qty_owned 0', async () => {
    const w = await mountPage();
    const par = rowByCode(w, 'LX/PAR 64');
    // columns: code, name, category, unit, qty, price, last_changed, actions
    expect(par.findAll('td')[6].text().trim()).toBe('—');
    expect(rowByCode(w, 'RIG-TRUSS-3M').findAll('td')[4].text().trim()).toBe('—');
    expect(rowByCode(w, 'STG-DECK-2X1').findAll('td')[4].text().trim()).toBe('0');
  });

  it('renders a very long name in full and does not collapse the row', async () => {
    const w = await mountPage();
    expect(rowByCode(w, 'AV-LED-P3').text()).toContain(LONG_NAME);
  });

  it('renders the category filter options from the API categories', async () => {
    const w = await mountPage();
    const cat = selectByLabel(w, 'Category');
    const labels = (cat.props('options') as Array<{ label: string }>).map((o) => o.label);
    expect(labels[0]).toBe('All categories');
    for (const c of CATEGORIES) expect(labels).toContain(c);
  });

  it('choosing a customer reloads with ?customer= and reveals the Trade column; null customer_price renders the em-dash', async () => {
    const w = await mountPage();
    expect(w.text()).not.toContain('Trade (Aurras)');
    mockedItems.mockResolvedValue(listResponse(ITEMS, { contacts_id: AURRAS_ID, name: 'AURRAS GROUP (PTY) LTD' }));
    await chooseInSelect(selectByLabel(w, 'Customer'), AURRAS_ID);
    const last = mockedItems.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last.customer).toBe(AURRAS_ID);
    expect(w.text()).toContain('Trade (Aurras)');
    expect(w.text()).toContain('Trade: AURRAS GROUP (PTY) LTD');
    const v10 = rowByCode(w, 'DB-V10P');
    expect(v10.text()).toContain(zar('1200.00'));
    expect(v10.text()).toContain('TRADE');
    const par = rowByCode(w, 'LX/PAR 64');
    // customer_price column is index 6 once revealed
    expect(par.findAll('td')[6].text().trim()).toBe('—');
    expect(par.text()).not.toMatch(/NaN|null|undefined/);
  });

  it('shows the empty state when the API returns items: [] (and no table rows)', async () => {
    mockedItems.mockResolvedValue({ count: 0, categories: [], customer: null, items: [] });
    const w = await mountPage();
    expect(w.text()).toContain('No items match');
    expect(bodyRows(w)).toHaveLength(0);
    expect(w.find('.ktable-state-wrapper--loading').exists()).toBe(false);
  });

  it('surfaces an API rejection as a visible error and is not stuck loading', async () => {
    mockedItems.mockRejectedValue(new Error('Network Error'));
    const w = await mountPage();
    const alert = w.find('.kalert--error');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Network Error');
    expect(w.find('.ktable-state-wrapper--loading').exists()).toBe(false);
    expect(w.find('.ktable-loading-overlay').exists()).toBe(false);
    expect(w.findAll('.kspinner').length).toBe(0);
    // Refresh is usable again
    expect(buttonByText(w, 'Refresh').attributes('disabled')).toBeUndefined();
  });

  it('surfaces the server detail message when the rejection carries response.data.detail', async () => {
    mockedItems.mockRejectedValue({ response: { status: 503, data: { detail: 'pricelist schema unavailable' } } });
    const w = await mountPage();
    expect(w.find('.kalert--error').text()).toContain('pricelist schema unavailable');
  });

  it('Refresh re-calls the API and re-renders new rows', async () => {
    const w = await mountPage();
    mockedItems.mockResolvedValue(listResponse(ITEMS.slice(0, 2)));
    await buttonByText(w, 'Refresh').trigger('click');
    await flushPromises();
    await nextTick();
    expect(bodyRows(w)).toHaveLength(2);
    expect(w.text()).toContain('Showing 2 of 2 items');
  });

  it('Export CSV calls downloadExport with the active/customer filters and surfaces a failure', async () => {
    mockedExport.mockResolvedValueOnce(undefined);
    const w = await mountPage();
    await buttonByText(w, 'Export CSV').trigger('click');
    await flushPromises();
    expect(mockedExport).toHaveBeenCalledWith({ customer: undefined, active: 'true' });

    mockedExport.mockRejectedValueOnce({ response: { data: { detail: 'export disabled' } } });
    await buttonByText(w, 'Export CSV').trigger('click');
    await flushPromises();
    await nextTick();
    expect(w.find('.kalert--error').text()).toContain('export disabled');
    expect(buttonByText(w, 'Export CSV').attributes('disabled')).toBeUndefined();
  });
});

// ── Tabs / URL sync ─────────────────────────────────────────────────────────

describe('Pricelist — tabs and ?tab= sync', () => {
  it('starts on the rate card with no ?tab= and switches to the quote builder on click, writing ?tab=quote', async () => {
    const w = await mountPage();
    expect(w.text()).toContain('Showing');
    expect(w.find('.pl-line').exists()).toBe(false);
    await goToQuoteTab(w);
    expect(router.currentRoute.value.query.tab).toBe('quote');
    expect(w.text()).toContain('Price it');
    expect(w.text()).toContain('No quote yet');
    expect(w.find('.ktable-tbody').exists()).toBe(false);
  });

  it('honours ?tab=quote on first render', async () => {
    const w = await mountPage({ tab: 'quote' });
    expect(w.text()).toContain('Price it');
    expect(w.text()).not.toContain('Showing');
  });

  it('lands on the rate card for a bogus ?tab=', async () => {
    const w = await mountPage({ tab: 'bogus' });
    expect(w.text()).toContain('Showing');
    expect(w.find('.pl-line').exists()).toBe(false);
  });

  it('rewrites a bogus ?tab= present at first load to the normalised slug', async () => {
    // Adversarial: the page's own comment promises "a stale / bogus ?tab= …
    // always lands on a valid tab" and the watcher rewrites bogus slugs — but
    // the watcher is not immediate, so a bogus value in the INITIAL URL is
    // never rewritten. Reloading/sharing the URL keeps ?tab=bogus.
    await mountPage({ tab: 'bogus' });
    await flushPromises();
    await nextTick();
    expect(router.currentRoute.value.query.tab).toBe('items');
  });

  it('rewrites a bogus ?tab= that arrives after mount (watcher path)', async () => {
    const w = await mountPage();
    await router.replace({ path: '/pricelist', query: { tab: 'nonsense' } });
    await flushPromises();
    await nextTick();
    expect(w.text()).toContain('Showing');
    expect(router.currentRoute.value.query.tab).toBe('items');
  });

  it('follows an external route change (back/forward) back to the rate card', async () => {
    const w = await mountPage({ tab: 'quote' });
    await router.replace({ path: '/pricelist', query: { tab: 'items' } });
    await flushPromises();
    await nextTick();
    expect(w.text()).toContain('Showing');
    expect(w.text()).not.toContain('Price it');
  });
});

// ── History dialog ──────────────────────────────────────────────────────────

describe('Pricelist — price history dialog', () => {
  it('opens for a code that needs URL-encoding, passes the RAW code to the API, and renders valid_to: null as "current"', async () => {
    mockedHistory.mockResolvedValue({
      code: 'LX/PAR 64',
      count: 2,
      prices: [
        { id: 12, price: '85.00', valid_from: '2025-11-01', valid_to: null, price_type: 'LIST', customer_id: null, customer_name: null, note: null, set_by: null, created_at: '2025-11-01T09:00:00+02:00' },
        { id: 7, price: '80.00', valid_from: '2024-01-01', valid_to: '2025-10-31', price_type: 'LIST', customer_id: null, customer_name: null, note: 'Opening rate', set_by: 'mc', created_at: '2024-01-01T09:00:00+02:00' },
      ],
    });
    const w = await mountPage();
    const row = rowByCode(w, 'LX/PAR 64');
    await row.findAll('button').find((b) => b.text() === 'History')!.trigger('click');
    await flushPromises();
    await nextTick();

    expect(mockedHistory).toHaveBeenCalledWith('LX/PAR 64');
    const dlg = dialogEl();
    expect(dlg).not.toBeNull();
    const text = dlg!.textContent || '';
    expect(text).toContain('LX/PAR 64');
    const openEnded = Array.from(dlg!.querySelectorAll('.pl-current')).map((e) => (e.textContent || '').trim());
    expect(openEnded).toEqual(['current']); // exactly one open-ended row, rendered as "current", not "null"
    expect(text).toContain('2025-10-31');
    expect(text).toContain(zar('85.00'));
    expect(text).toContain('Everyone');
    expect(text).toContain('Opening rate');
    expect(text).not.toMatch(/NaN|undefined/);
    expect(dlg!.querySelectorAll('.ktable-tbody tr')).toHaveLength(2);
  });

  it('shows the empty state when the item has no price rows', async () => {
    mockedHistory.mockResolvedValue({ code: 'PWR-DIST-63A', count: 0, prices: [] });
    const w = await mountPage();
    await rowByCode(w, 'PWR-DIST-63A').findAll('button').find((b) => b.text() === 'History')!.trigger('click');
    await flushPromises();
    await nextTick();
    expect(dialogEl()!.textContent).toContain('No price rows');
  });

  it('shows the error inside the dialog when history fails and clears the spinner', async () => {
    mockedHistory.mockRejectedValue({ response: { data: { detail: 'history unavailable' } } });
    const w = await mountPage();
    await rowByCode(w, 'DB-V10P').findAll('button').find((b) => b.text() === 'History')!.trigger('click');
    await flushPromises();
    await nextTick();
    const dlg = dialogEl()!;
    expect(dlg.textContent).toContain('history unavailable');
    expect(dlg.querySelector('.pl-dialog-loading')).toBeNull();
  });
});

// ── Set-price dialog ────────────────────────────────────────────────────────

describe('Pricelist — set-price dialog', () => {
  async function openSetPrice(w: VueWrapper, code: string) {
    await rowByCode(w, code).findAll('button').find((b) => b.text() === 'Set price')!.trigger('click');
    await flushPromises();
    await nextTick();
    expect(dialogEl()).not.toBeNull();
  }

  it('pre-fills from the row, posts the body the backend expects, shows the notice, closes and reloads', async () => {
    mockedSetPrice.mockResolvedValue({
      price: { id: 99, price: '1500.00', valid_from: '2026-08-19', valid_to: null, price_type: 'LIST', customer_id: null, customer_name: null, note: 'Annual uplift', set_by: 'mc', created_at: '2026-08-19T10:00:00+02:00' },
      closed_previous: { id: 3, price: '1400.00', valid_from: '2026-03-01', valid_to: '2026-08-18', price_type: 'LIST' },
    });
    const w = await mountPage();
    const callsBefore = mockedItems.mock.calls.length;
    await openSetPrice(w, 'DB-V10P');
    expect(dialogEl()!.textContent).toContain('Set price — DB-V10P');
    expect(dialogEl()!.textContent).toContain(zar('1400.00'));

    const priceInput = inputByLabel(w, 'Price (ex VAT, ZAR)');
    // '1400.00', not '1400': the field is type="text" and is pre-filled with the API's exact
    // 2-dp string, so what MC sees in the box is literally the price on record. (It briefly
    // read '1400' while the field was type="number" and Number()-coerced — that was changed
    // because Number('') === 0 let an emptied box save as R 0.00. See Pricelist.vue.)
    expect((priceInput.find('input').element as HTMLInputElement).value).toBe('1400.00');
    await priceInput.find('input').setValue('1500');
    await inputByLabel(w, 'Note').find('input').setValue('Annual uplift');
    await nextTick();

    await dialogButton('Save price').trigger('click');
    await flushPromises();
    await nextTick();

    expect(mockedSetPrice).toHaveBeenCalledTimes(1);
    const [code, body] = mockedSetPrice.mock.calls[0];
    expect(code).toBe('DB-V10P');
    expect(body).toEqual({
      price: '1500.00',
      valid_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      price_type: 'LIST',
      customer: null,
      note: 'Annual uplift',
      set_by: 'mc',
    });

    expect(dialogEl()).toBeNull();
    const success = w.find('.kalert--success');
    expect(success.exists()).toBe(true);
    expect(success.text()).toContain('DB-V10P');
    expect(success.text()).toContain(zar('1500.00'));
    expect(success.text()).toContain('2026-08-18');
    expect(success.text()).not.toMatch(/NaN|undefined/);
    expect(mockedItems.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('keeps the dialog OPEN and shows the exact server detail when the POST rejects', async () => {
    mockedSetPrice.mockRejectedValue({ response: { status: 409, data: { detail: 'a price dated 2026-01-01 already exists' } } });
    const w = await mountPage();
    await openSetPrice(w, 'CAB-XLR-10');
    await inputByLabel(w, 'Price (ex VAT, ZAR)').find('input').setValue('16');
    await dialogButton('Save price').trigger('click');
    await flushPromises();
    await nextTick();

    expect(dialogEl()).not.toBeNull();
    expect(dialogEl()!.textContent).toContain('a price dated 2026-01-01 already exists');
    // button re-enabled for a retry
    expect(dialogButton('Save price').attributes('disabled')).toBeUndefined();
    expect(w.find('.kalert--success').exists()).toBe(false);
  });

  it('opens with an empty price for an item that has no current price and Save is disabled until a price is typed', async () => {
    const w = await mountPage();
    await openSetPrice(w, 'PWR-DIST-63A');
    const input = inputByLabel(w, 'Price (ex VAT, ZAR)').find('input');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(dialogButton('Save price').attributes('disabled')).toBeDefined();
    await input.setValue('950');
    await nextTick();
    expect(dialogButton('Save price').attributes('disabled')).toBeUndefined();
  });

  it('clearing the price field again disables Save (an empty field must not be submittable as R 0.00)', async () => {
    // Adversarial: KInput type=number coerces '' → 0, so setForm.price becomes 0
    // and the form validates. If this fails the page can save an unintended R 0.00.
    const w = await mountPage();
    await openSetPrice(w, 'DB-V10P');
    const input = inputByLabel(w, 'Price (ex VAT, ZAR)').find('input');
    await input.setValue('');
    await nextTick();
    expect(dialogButton('Save price').attributes('disabled')).toBeDefined();
  });

  it('a non-LIST price with no customer shows the "applies to everyone" warning and passes customer: null', async () => {
    mockedSetPrice.mockResolvedValue({ price: { price: '1100.00', valid_from: '2026-08-19' }, closed_previous: null });
    const w = await mountPage();
    await openSetPrice(w, 'DB-V10P');
    await chooseInSelect(selectByLabel(w, 'Price type'), 'TRADE');
    expect(dialogEl()!.textContent).toContain('A TRADE price with no customer applies to everyone');
    await inputByLabel(w, 'Price (ex VAT, ZAR)').find('input').setValue('1100');
    await dialogButton('Save price').trigger('click');
    await flushPromises();
    await nextTick();
    expect(mockedSetPrice.mock.calls[0][1]).toMatchObject({ price_type: 'TRADE', customer: null, price: '1100.00' });
    expect(w.find('.kalert--success').text()).toContain('TRADE');
  });

  it('Cancel closes without posting', async () => {
    const w = await mountPage();
    await openSetPrice(w, 'DB-V10P');
    await dialogButton('Cancel').trigger('click');
    await flushPromises();
    await nextTick();
    expect(dialogEl()).toBeNull();
    expect(mockedSetPrice).not.toHaveBeenCalled();
  });
});

// ── Quote builder ───────────────────────────────────────────────────────────

describe('Pricelist — quote builder', () => {
  it('renders the builder with one empty line, Price it disabled, and the hint', async () => {
    const w = await mountPage({ tab: 'quote' });
    expect(w.findAll('.pl-line')).toHaveLength(1);
    expect(buttonByText(w, 'Price it').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Pick at least one item to price.');
    // the only line cannot be removed
    expect(w.find('.pl-line__remove').attributes('disabled')).toBeDefined();
    expect(mockedQuote).not.toHaveBeenCalled();
  });

  it('the item picker is populated from the catalogue with "CODE — name" labels', async () => {
    const w = await mountPage({ tab: 'quote' });
    const line = w.find('.pl-line');
    const sel = w.findAllComponents(KSelect).find((k) => k.element === line.find('.pl-line__item').element)!;
    const opts = sel.props('options') as Array<{ value: string; label: string }>;
    expect(opts.length).toBe(ITEMS.length);
    expect(opts.find((o) => o.value === 'DB-V10P')?.label).toBe('DB-V10P — d&b V10P, yoke and pole');
  });

  it('Add line / Remove line manage the line list', async () => {
    const w = await mountPage({ tab: 'quote' });
    await buttonByText(w, 'Add line').trigger('click');
    await nextTick();
    expect(w.findAll('.pl-line')).toHaveLength(2);
    expect(w.findAll('.pl-line__remove')[0].attributes('disabled')).toBeUndefined();
    await w.findAll('.pl-line__remove')[1].trigger('click');
    await nextTick();
    expect(w.findAll('.pl-line')).toHaveLength(1);
  });

  it('prices the quote: posts the expected body, renders warnings, lines, "not priced" flag and server totals', async () => {
    mockedQuote.mockResolvedValue(QUOTE_RESPONSE);
    const w = await mountPage({ tab: 'quote' });
    await pickLineItem(w, 'DB-V10P');
    expect(buttonByText(w, 'Price it').attributes('disabled')).toBeUndefined();
    await buttonByText(w, 'Add line').trigger('click');
    await nextTick();
    await pickLineItem(w, 'PWR-DIST-63A', 1);
    await buttonByText(w, 'Price it').trigger('click');
    await flushPromises();
    await nextTick();

    expect(mockedQuote).toHaveBeenCalledTimes(1);
    expect(mockedQuote.mock.calls[0][0]).toEqual({
      lines: [
        { code: 'DB-V10P', qty: 1, days: 1 },
        { code: 'PWR-DIST-63A', qty: 1, days: 1 },
      ],
      customer: null,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      discount_pct: 0,
      vat_rate: 0.15,
    });

    const text = w.text();
    for (const wmsg of QUOTE_RESPONSE.warnings) expect(text).toContain(wmsg);
    expect(w.find('.kalert--warning').exists()).toBe(true);
    expect(w.findAll('.pl-result .ktable-tbody tr')).toHaveLength(3);
    expect(text).toContain('not priced');
    expect(text).toContain(zar('11200.00'));
    expect(text).toContain(zar('12050.00'));
    expect(text).toContain(zar('1205.00'));
    expect(text).toContain(zar('10845.00'));
    expect(text).toContain(zar('1626.75'));
    expect(text).toContain(zar('12471.75'));
    expect(text).toContain('List price (no customer)');
    expect(text).toContain('VAT 15%');
    expect(text).toContain('discount 10%');
    expect(text).not.toMatch(/NaN|undefined/);
    expect(text).not.toContain('No quote yet');
  });

  it('a buildQuote rejection surfaces the error and re-enables Price it', async () => {
    mockedQuote.mockRejectedValue({ response: { status: 400, data: { error: 'Unknown item code ZZZ' } } });
    const w = await mountPage({ tab: 'quote' });
    await pickLineItem(w, 'DB-V10P');
    await buttonByText(w, 'Price it').trigger('click');
    await flushPromises();
    await nextTick();
    expect(w.find('.kalert--error').text()).toContain('Unknown item code ZZZ');
    const btn = buttonByText(w, 'Price it');
    expect(btn.attributes('disabled')).toBeUndefined();
    expect(btn.text()).toBe('Price it');
    expect(w.text()).toContain('No quote yet');
  });

  it('sends the chosen customer and numeric qty/days/discount/vat to the API', async () => {
    mockedQuote.mockResolvedValue({ ...QUOTE_RESPONSE, customer_id: AURRAS_ID, customer_name: 'AURRAS GROUP (PTY) LTD' });
    const w = await mountPage({ tab: 'quote' });
    await chooseInSelect(selectByLabel(w, 'Customer'), AURRAS_ID);
    await inputByLabel(w, 'Discount %').find('input').setValue('12.5');
    await pickLineItem(w, 'DB-V10P');
    const line = w.find('.pl-line');
    const nums = line.findAll('input[type="number"]');
    await nums[0].setValue('4');
    await nums[1].setValue('2');
    await buttonByText(w, 'Price it').trigger('click');
    await flushPromises();
    await nextTick();
    expect(mockedQuote.mock.calls[0][0]).toMatchObject({
      customer: AURRAS_ID,
      discount_pct: 12.5,
      lines: [{ code: 'DB-V10P', qty: 4, days: 2 }],
    });
    expect(w.text()).toContain('AURRAS GROUP (PTY) LTD');
  });

  it('renders a historical 14% VAT rate as "VAT 14%" (no floating-point tail)', async () => {
    // Adversarial: Number('0.14') * 100 === 14.000000000000002 in JS.
    mockedQuote.mockResolvedValue({ ...QUOTE_RESPONSE, vat_rate: '0.14', date: '2018-03-01' });
    const w = await mountPage({ tab: 'quote' });
    await pickLineItem(w, 'DB-V10P');
    await buttonByText(w, 'Price it').trigger('click');
    await flushPromises();
    await nextTick();
    expect(w.text()).toContain('VAT 14%');
    expect(w.text()).not.toMatch(/14\.0000/);
  });
});
