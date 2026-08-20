import { describe, expect, it } from 'vitest';
import {
  groupJournalLines,
  receiptToCorrectionDraft,
  validateCorrectionDraft,
} from '../receiptsV2';

describe('receiptToCorrectionDraft', () => {
  it('prefers reviewed receipt fields and falls back to OCR fields', () => {
    const draft = receiptToCorrectionDraft({
      supplier: 'BP Dorp Street',
      total: '2387.03',
      slip_date: '2026-08-17',
      category: 'Fuel',
      ocr: {
        supplier: 'Wrong supplier',
        invoice_number: 'BP-817',
        subtotal: '2075.68',
        vat: '311.35',
      },
      items: [{ description: 'Diesel', amount: '2387.03' }],
    });

    expect(draft).toMatchObject({
      supplier: 'BP Dorp Street',
      invoice_number: 'BP-817',
      receipt_date: '2026-08-17',
      category: 'Fuel',
      subtotal: '2075.68',
      vat: '311.35',
      total: '2387.03',
    });
    expect(draft.line_items).toEqual([
      { description: 'Diesel', amount: '2387.03', account_code: '', tax_rate: '' },
    ]);
  });
});
describe('validateCorrectionDraft', () => {
  it('requires supplier, date and a valid total', () => {
    expect(validateCorrectionDraft({ supplier: '', receipt_date: '', total: '' })).toMatchObject({
      supplier: expect.any(String),
      receipt_date: expect.any(String),
      total: expect.any(String),
    });
  });

  it('catches a subtotal and VAT mismatch', () => {
    const errors = validateCorrectionDraft({
      supplier: 'Makro',
      receipt_date: '2026-08-04',
      subtotal: '100.00',
      vat: '15.00',
      total: '120.00',
    });
    expect(errors.total).toContain('do not add up');
  });

  it('accepts a balanced corrected extraction', () => {
    expect(validateCorrectionDraft({
      supplier: 'Makro',
      receipt_date: '2026-08-04',
      subtotal: '100.00',
      vat: '15.00',
      total: '115.00',
    })).toEqual({});
  });
});

describe('groupJournalLines', () => {
  it('groups duplicate ledger lines by Xero source transaction and ranks the exact amount first', () => {
    const lines = [
      {
        id: 1,
        transaction_source_id: 'far',
        tenant_name: 'Klikk',
        date: '2026-07-01',
        supplier_name: 'BP Dorp Street',
        report: 'Income Statement',
        amount: '1000.00',
        journal_number: 10,
        account_code: '382',
        account_name: 'Fuel',
      },
      {
        id: 2,
        transaction_source_id: 'exact',
        tenant_name: 'Klikk',
        date: '2026-08-16',
        supplier_name: 'BP Dorp Street',
        report: 'Income Statement',
        amount: '2387.03',
        journal_number: 11,
        account_code: '382',
        account_name: 'Fuel',
      },
      {
        id: 3,
        transaction_source_id: 'exact',
        tenant_name: 'Klikk',
        date: '2026-08-16',
        supplier_name: 'BP Dorp Street',
        report: 'Balance Sheet',
        amount: '-2387.03',
        journal_number: 11,
        account_code: '800',
        account_name: 'Accounts Payable',
      },
    ];

    const groups = groupJournalLines(lines, { total: '2387.03', receipt_date: '2026-08-17' });
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ id: 'exact', amount: 2387.03, amount_delta: 0 });
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].accounts).toEqual(['382 · Fuel', '800 · Accounts Payable']);
  });
});
