import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SFC_PATH = resolve(__dirname, '../FinancialInvestmentStrategy.vue');
const source = readFileSync(SFC_PATH, 'utf-8');

describe('FinancialInvestmentStrategy - smoke', () => {
  it('renders the strategy page shell', () => {
    expect(source).toContain('Investment Strategy');
    expect(source).toContain('Portfolio policy, allocation bands and decision rules');
  });

  it('exposes the strategy tabs', () => {
    expect(source).toContain("{ name: 'performance', label: 'Performance' }");
    expect(source).toContain("{ name: 'overview', label: 'Overview' }");
    expect(source).toContain("{ name: 'allocation', label: 'Allocation' }");
    expect(source).toContain("{ name: 'rules', label: 'Rules' }");
  });

  it('loads portfolio data for capital growth, dividend yield and ROI', () => {
    expect(source).toContain('getInvestecPortfolio');
    expect(source).toContain('All Stock Returns');
    expect(source).toContain('Capital growth');
    expect(source).toContain('Dividend yield');
    expect(source).toContain('ROI');
    expect(source).toContain('normalisePortfolioProfitLoss');
    expect(source).toContain('normaliseAnnualIncome');
    expect(source).toContain('isCashHolding');
    expect(source).toContain('safePercent(capitalGrowth + row.annual_income_zar, row.total_cost)');
    expect(source).toContain('normalisePortfolioValue');
    expect(source).toContain('normalisePortfolioPrice');
    expect(source).toContain('portfolioValueScale');
    expect(source).toContain('portfolioPriceScale');
  });

  it('keeps All Stock Returns scrollable inside the dashboard card', () => {
    expect(source).toContain('class="fis-performance-table"');
    expect(source).toContain('.fis-performance-table :deep(.ktable-scroll-container)');
    expect(source).toContain('overflow-y: auto');
  });

  it('shows return by individual Investec purchase lot', () => {
    expect(source).toContain('getFinancialInvestmentsBuyTransactions');
    expect(source).toContain('Individual Purchase Returns');
    expect(source).toContain('purchaseReturnColumns');
    expect(source).toContain('fetchPurchaseReturns');
    expect(source).toContain('buildPurchaseReturnRow');
    expect(source).toContain('holdingCurrentUnitPrice');
    expect(source).toContain('Lot value');
    expect(source).toContain('source_note');
  });

  it('lists actual long-period underperformers from price history', () => {
    expect(source).toContain('Long Period Underperformers');
    expect(source).toContain('getFinancialInvestmentsHistory');
    expect(source).toContain('getFinancialInvestmentsSymbols');
    expect(source).toContain('underperformerPeriod');
    expect(source).toContain('annualisedReturnPct');
    expect(source).toContain("underperformerPeriods = ['5Y', 'ALL']");
  });

  it('declares model allocation and decision rules', () => {
    expect(source).toContain('allocationRows');
    expect(source).toContain('decisionRules');
    expect(source).toContain('Core quality');
    expect(source).toContain('Check the chart event history');
  });
});
