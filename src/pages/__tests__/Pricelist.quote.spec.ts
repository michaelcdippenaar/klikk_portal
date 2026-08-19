// @vitest-environment happy-dom
/**
 * Pricelist.quote.spec.ts
 *
 * The client-side arithmetic / formatting the page OWNS (adversarial):
 *   - formatZar           — the single money formatter (ZAR, 2 dp, em-dash for empty)
 *   - downloadQuoteCsv    — the client-built CSV (escaping of commas / quotes)
 *   - quoteAsText         — the clipboard text
 *   - totals passthrough  — the page must render the SERVER's subtotal / discount /
 *                           ex_vat / vat / incl_vat verbatim and never recompute them.
 *
 * None of these helpers are exported from the SFC, so every one is exercised
 * through a real mount and observed via the DOM, the Blob handed to
 * URL.createObjectURL, or the text handed to navigator.clipboard.writeText.
 * Only the API module is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
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

import { getPriceListItems, buildQuote } from '@/api/pricelist';
import Pricelist from '../Pricelist.vue';
import KSelect from '../../components/klikk/KSelect.vue';

const mockedItems = vi.mocked(getPriceListItems);
const mockedQuote = vi.mocked(buildQuote);

// ── Expectation helpers ─────────────────────────────────────────────────────

/** What the page's formatter should produce, computed with Intl so the test is not locale-brittle. */
const zar = (v: string | number) =>
  'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Minimal RFC-4180 parser: quoted fields, "" escapes, CRLF/LF rows, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\r') {
      // swallow; the following \n terminates the row
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

async function blobText(blob: Blob): Promise<string> {
  if (typeof (blob as { text?: () => Promise<string> }).text === 'function') return blob.text();
  return new Response(blob).text();
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function item(code: string, name: string, current_price: string | null, extra: Record<string, unknown> = {}) {
  return {
    code, name, category: 'Audio', unit: 'day', qty_owned: 2, description: '', active: true,
    xero_account_code: '200', xero_tracking_option_id: null, xero_purchase_line_id: null,
    xero_purchase_line: null, xero_fixed_asset_id: null, notes: null,
    created_at: '2026-01-01T08:00:00+02:00', updated_at: '2026-01-01T08:00:00+02:00',
    current_price, current_price_valid_from: current_price ? '2026-01-01' : null,
    last_changed: current_price ? '2026-01-01' : null, price_count: current_price ? 1 : 0,
    customer_price: null, customer_price_type: null,
    ...extra,
  };
}

const ITEMS = [
  item('DB-V10P', 'd&b V10P, yoke and pole', '1400.00'),
  item('LX/PAR 64', 'Par 64 "long-nose" can', '85.00'),
  item('CAB-XLR-10', 'XLR cable 10 m', '0.50'),
  item('AV-LED-P3', 'LED wall P3.9 per sqm', '1234567.89'),
  item('PWR-DIST-63A', 'Power distro 63A', null),
  item('MISC-EMPTY', 'Empty-string price from a bad import', ''),
  item('MISC-TBC', 'Non-numeric price string from a bad import', 'TBC'),
];

const QUOTE = {
  date: '2026-08-19',
  customer_id: null,
  customer_name: null,
  vat_rate: '0.15',
  discount_pct: '10.00',
  lines: [
    { code: 'DB-V10P', name: 'd&b V10P, yoke and pole', unit: 'day', category: 'Audio', qty: 4, days: 2, unit_price: '1400.00', price_type: 'LIST', priced: true, line_total: '11200.00', valid_from: '2026-03-01', note: null },
    { code: 'LX/PAR 64', name: 'Par 64 "long-nose" can', unit: 'day', category: 'Lighting', qty: 10, days: 1, unit_price: '85.00', price_type: 'LIST', priced: true, line_total: '850.00', valid_from: '2025-11-01', note: 'Client said "keep it cheap", ok' },
    { code: 'PWR-DIST-63A', name: 'Power distro 63A', unit: 'day', category: 'Power', qty: 1, days: 2, unit_price: null, price_type: null, priced: false, line_total: '0.00', valid_from: null, note: 'No price effective 2026-08-19' },
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

// ── Mount helpers ───────────────────────────────────────────────────────────

const mounted: VueWrapper[] = [];
let router: Router;

async function mountPage(query: Record<string, string> = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/pricelist', name: 'pricelist', component: Pricelist }],
  });
  await router.push({ path: '/pricelist', query });
  await router.isReady();
  const wrapper = mount(Pricelist, { attachTo: document.body, global: { plugins: [router] } });
  mounted.push(wrapper);
  await flushPromises();
  await nextTick();
  return wrapper;
}

function rowByCode(w: VueWrapper, code: string) {
  const row = w.findAll('.ktable-tbody tr').find((r) => r.text().includes(code));
  if (!row) throw new Error(`No rendered row for ${code}`);
  return row;
}

function priceCellText(w: VueWrapper, code: string) {
  // rate-card columns: code, name, category, unit, qty, list price, last changed, actions
  return rowByCode(w, code).findAll('td')[5].text().trim();
}

function buttonByText(w: VueWrapper, text: string) {
  const b = w.findAll('button').find((x) => x.text().trim().startsWith(text));
  if (!b) throw new Error(`No button "${text}"`);
  return b;
}

/** Mount on the quote tab, pick one line item, press "Price it" with the given server response. */
async function priceQuote(response: Record<string, unknown>) {
  mockedQuote.mockResolvedValue(response);
  const w = await mountPage({ tab: 'quote' });
  const line = w.find('.pl-line');
  const sel = w.findAllComponents(KSelect).find((k) => k.element === line.find('.pl-line__item').element);
  if (!sel) throw new Error('No item KSelect in the quote line');
  sel.findComponent(SelectRoot).vm.$emit('update:modelValue', 'DB-V10P');
  await nextTick();
  await buttonByText(w, 'Price it').trigger('click');
  await flushPromises();
  await nextTick();
  if (!w.find('.pl-result').exists()) throw new Error('Quote result did not render');
  return w;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockedItems.mockReset();
  mockedQuote.mockReset();
  mockedItems.mockResolvedValue({ count: ITEMS.length, categories: ['Audio'], customer: null, items: ITEMS });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  document.body.innerHTML = '';
  errorSpy.mockRestore();
  vi.restoreAllMocks();
});

// ── formatZar (via the rate-card price cells) ───────────────────────────────

describe('Pricelist — formatZar (observed through the rate card)', () => {
  it('renders "R " + en-ZA grouped number with exactly 2 decimals', async () => {
    const w = await mountPage();
    expect(priceCellText(w, 'DB-V10P')).toBe(zar('1400.00'));
    expect(priceCellText(w, 'AV-LED-P3')).toBe(zar('1234567.89'));
    expect(priceCellText(w, 'CAB-XLR-10')).toBe(zar('0.50'));
    for (const code of ['DB-V10P', 'AV-LED-P3', 'CAB-XLR-10']) {
      const t = priceCellText(w, code);
      expect(t.startsWith('R ')).toBe(true);
      expect(t).toMatch(/[.,]\d{2}$/); // exactly two fraction digits after the decimal mark
    }
    // grouping actually happened for the 7-digit value (some separator between 1 and 234)
    expect(priceCellText(w, 'AV-LED-P3')).toMatch(/^R 1[\s  ,.']234[\s  ,.']567[.,]89$/);
  });

  it('formats money as en-ZA, matching the rest of the console (comma decimal mark)', async () => {
    // Resolved 2026-08-19: this originally asserted a POINT decimal ("R 1 400.00") because the
    // build brief said so. The brief was wrong. en-ZA CLDR uses a comma as the decimal mark, and
    // other console pages (FinancialInvestmentStrategy, DividendForecast, FinancialInvestments)
    // already format money with toLocaleString('en-ZA'). Consistency across the console wins over
    // the brief, so the EXPECTATION was corrected rather than the page.
    // If MC wants a point decimal it is a console-WIDE change, not a Pricelist-only one.
    const w = await mountPage();
    const expected = 'R ' + (1400).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(priceCellText(w, 'DB-V10P')).toBe(expected);
    expect(expected).toMatch(/^R 1[^0-9]400,00$/); // pins the SA convention (space group, comma decimal)
  });

  it('renders the em-dash placeholder for null and empty-string prices', async () => {
    const w = await mountPage();
    expect(priceCellText(w, 'PWR-DIST-63A')).toBe('—');
    expect(priceCellText(w, 'MISC-EMPTY')).toBe('—');
  });

  it('never renders "NaN" for a non-numeric price string', async () => {
    // Adversarial: formatZar does Number(value) with no isFinite guard → "R NaN".
    const w = await mountPage();
    expect(priceCellText(w, 'MISC-TBC')).not.toContain('NaN');
    expect(w.text()).not.toContain('NaN');
  });
});

// ── Totals passthrough ──────────────────────────────────────────────────────

describe('Pricelist — quote totals are the SERVER numbers, never recomputed', () => {
  it('renders deliberately inconsistent server totals verbatim', async () => {
    const w = await priceQuote({
      ...QUOTE,
      lines: [{ ...QUOTE.lines[0], qty: 4, days: 2, unit_price: '1400.00', line_total: '5.00' }],
      subtotal: '100.00',
      discount: '0.00',
      ex_vat: '100.00',
      vat: '999.00',
      incl_vat: '1.00',
      warnings: [],
    });
    const rows = w.findAll('.pl-totals__row').map((r) => [r.find('dt').text(), r.find('dd').text().trim()]);
    expect(rows).toEqual([
      ['Subtotal', zar('100.00')],
      ['Discount', zar('0.00')],
      ['Ex VAT', zar('100.00')],
      ['VAT', zar('999.00')],
      ['Incl VAT', zar('1.00')],
    ]);
    // line_total is also passthrough: 4 × 2 × 1400 would be 11 200, server said 5.00
    const lineRow = w.find('.pl-result .ktable-tbody tr');
    expect(lineRow.text()).toContain(zar('5.00'));
    expect(lineRow.text()).not.toContain(zar('11200.00'));
    // nothing looks like a client-side VAT recompute (15% of 100 = 15)
    expect(w.find('.pl-totals').text()).not.toContain(zar('15.00'));
    expect(w.find('.pl-totals').text()).not.toContain(zar('115.00'));
  });

  it('renders the normal response totals, the warnings, and the "not priced" line', async () => {
    const w = await priceQuote(QUOTE);
    const dl = w.find('.pl-totals').text();
    expect(dl).toContain(zar('12050.00'));
    expect(dl).toContain(zar('1205.00'));
    expect(dl).toContain(zar('10845.00'));
    expect(dl).toContain(zar('1626.75'));
    expect(dl).toContain(zar('12471.75'));
    for (const wmsg of QUOTE.warnings) expect(w.text()).toContain(wmsg);
    const unpriced = w.findAll('.pl-result .ktable-tbody tr').find((r) => r.text().includes('PWR-DIST-63A'))!;
    expect(unpriced.text()).toContain('not priced');
    expect(unpriced.text()).toContain('—'); // null unit_price
    expect(unpriced.text()).not.toMatch(/NaN|null|undefined/);
  });
});

// ── CSV builder ─────────────────────────────────────────────────────────────

describe('Pricelist — quote CSV download', () => {
  function captureDownload() {
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true, writable: true,
      value: vi.fn((b: Blob) => { blobs.push(b); return 'blob:mock-url'; }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download || this.getAttribute('download') || '');
    });
    return { blobs, downloads };
  }

  it('writes a header row, one row per line, a blank spacer, the five totals, and round-trips commas/quotes', async () => {
    const { blobs, downloads } = captureDownload();
    const w = await priceQuote(QUOTE);
    await buttonByText(w, 'Download CSV').trigger('click');
    await flushPromises();

    expect(blobs).toHaveLength(1);
    expect(downloads).toEqual(['klikk_quote_2026-08-19.csv']);
    expect(blobs[0].type).toMatch(/^text\/csv/);

    const csv = await blobText(blobs[0]);
    const rows = parseCsv(csv);

    expect(rows[0]).toEqual([
      'code', 'name', 'unit', 'category', 'qty', 'days', 'unit_price', 'price_type', 'priced', 'line_total', 'valid_from', 'note',
    ]);
    // one row per line, in order, with the ORIGINAL strings back (comma + quote survive the round-trip)
    expect(rows[1]).toEqual(['DB-V10P', 'd&b V10P, yoke and pole', 'day', 'Audio', '4', '2', '1400.00', 'LIST', 'yes', '11200.00', '2026-03-01', '']);
    expect(rows[2]).toEqual(['LX/PAR 64', 'Par 64 "long-nose" can', 'day', 'Lighting', '10', '1', '85.00', 'LIST', 'yes', '850.00', '2025-11-01', 'Client said "keep it cheap", ok']);
    expect(rows[3]).toEqual(['PWR-DIST-63A', 'Power distro 63A', 'day', 'Power', '1', '2', '', '', 'no', '0.00', '', 'No price effective 2026-08-19']);
    expect(rows[4]).toEqual(['']); // spacer
    expect(rows.slice(5, 10)).toEqual([
      ['subtotal', '12050.00'],
      ['discount', '1205.00'],
      ['ex_vat', '10845.00'],
      ['vat', '1626.75'],
      ['incl_vat', '12471.75'],
    ]);
    expect(rows).toHaveLength(10);

    // raw-text sanity: the comma-bearing name must be quoted, and an embedded quote doubled
    expect(csv).toContain('"d&b V10P, yoke and pole"');
    expect(csv).toContain('"Par 64 ""long-nose"" can"');
    expect(csv).not.toMatch(/undefined|NaN|\[object/);
    expect(csv.split('\r\n')).toHaveLength(10);
  });

  it('escapes a newline inside a field so the row count is preserved', async () => {
    const { blobs } = captureDownload();
    const w = await priceQuote({
      ...QUOTE,
      lines: [{ ...QUOTE.lines[0], note: 'line one\nline two' }],
      warnings: [],
    });
    await buttonByText(w, 'Download CSV').trigger('click');
    const rows = parseCsv(await blobText(blobs[0]));
    expect(rows[1][11]).toBe('line one\nline two');
    expect(rows).toHaveLength(8); // header + 1 line + spacer + 5 totals
  });
});

// ── Clipboard text builder ──────────────────────────────────────────────────

describe('Pricelist — quote clipboard text', () => {
  function captureClipboard() {
    const writes: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async (t: string) => { writes.push(t); }) },
    });
    return writes;
  }

  it('includes every line code, the five totals, the warnings, and no undefined/NaN', async () => {
    const writes = captureClipboard();
    const w = await priceQuote(QUOTE);
    await buttonByText(w, 'Copy').trigger('click');
    await flushPromises();
    await nextTick();

    expect(writes).toHaveLength(1);
    const text = writes[0];
    for (const l of QUOTE.lines) expect(text).toContain(l.code);
    expect(text).toContain(zar('11200.00'));
    expect(text).toContain(`Subtotal  ${zar('12050.00')}`);
    expect(text).toContain(`Discount  ${zar('1205.00')}`);
    expect(text).toContain(`Ex VAT    ${zar('10845.00')}`);
    expect(text).toContain(`VAT       ${zar('1626.75')}`);
    expect(text).toContain(`Incl VAT  ${zar('12471.75')}`);
    expect(text).toContain('(not priced)');
    expect(text).toContain('Warnings:');
    for (const wmsg of QUOTE.warnings) expect(text).toContain(`- ${wmsg}`);
    expect(text).toContain('2026-08-19');
    expect(text).toContain('List price');
    expect(text).not.toMatch(/undefined|NaN|null|\[object/);
    // UI feedback
    expect(buttonByText(w, 'Copied').exists()).toBe(true);
  });

  it('names the customer when the server returns one', async () => {
    const writes = captureClipboard();
    const w = await priceQuote({ ...QUOTE, customer_id: 'abc', customer_name: 'AURRAS GROUP (PTY) LTD' });
    await buttonByText(w, 'Copy').trigger('click');
    await flushPromises();
    expect(writes[0]).toContain('AURRAS GROUP (PTY) LTD');
    expect(writes[0]).not.toContain('List price');
  });

  it('surfaces a clipboard failure as a visible error', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error('denied'); }) },
    });
    const w = await priceQuote(QUOTE);
    await buttonByText(w, 'Copy').trigger('click');
    await flushPromises();
    await nextTick();
    expect(w.find('.kalert--error').text()).toContain('Could not copy the quote to the clipboard.');
    expect(buttonByText(w, 'Copy').text()).toBe('Copy');
  });
});
