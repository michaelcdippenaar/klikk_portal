import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SFC_PATH = resolve(__dirname, '../Reporting.vue');
const source = readFileSync(SFC_PATH, 'utf-8');

describe('Reporting - smoke', () => {
  it('renders the reporting page shell', () => {
    expect(source).toContain('title="Reporting"');
    expect(source).toContain('Build reports across Xero, Investec, market data, and Planning Analytics');
  });

  it('defines the expected report domains', () => {
    expect(source).toContain('Financial statements');
    expect(source).toContain('Cash and banking');
    expect(source).toContain('Portfolio reporting');
    expect(source).toContain('Operational packs');
  });

  it('offers core report starting points', () => {
    expect(source).toContain('Monthly management pack');
    expect(source).toContain('Portfolio returns');
    expect(source).toContain('Dividend income forecast');
    expect(source).toContain('Bank reconciliation summary');
    expect(source).toContain('Data freshness and gaps');
  });

  it('includes the Investec bank cost report', () => {
    expect(source).toContain('Bank cost by account');
    expect(source).toContain('getInvestecBankCostReport');
    expect(source).toContain('Gross fees and interest');
    expect(source).toContain('Line item totals');
  });

  it('has a left report library menu with grouped reports', () => {
    expect(source).toContain('class="reporting-menu"');
    expect(source).toContain('reportGroups');
    expect(source).toContain('Executive');
    expect(source).toContain('Financials');
    expect(source).toContain('Debtors and Creditors');
    expect(source).toContain('Banking');
    expect(source).toContain('Investments');
    expect(source).toContain('Operations');
  });

  it('keeps the page responsive', () => {
    expect(source).toContain('@media (max-width: 1180px)');
    expect(source).toContain('@media (max-width: 760px)');
  });
});
