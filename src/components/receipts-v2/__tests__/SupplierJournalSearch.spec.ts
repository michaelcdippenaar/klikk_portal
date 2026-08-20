// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('../../../api/xeroJournals', () => ({
  searchXeroJournals: vi.fn(),
}));

import { searchXeroJournals } from '../../../api/xeroJournals';
import SupplierJournalSearch from '../SupplierJournalSearch.vue';

const searchMock = searchXeroJournals as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  searchMock.mockReset().mockResolvedValue({
    count: 2,
    limit: 200,
    offset: 0,
    results: [
      {
        id: 1,
        transaction_source_id: 'invoice-1',
        tenant_name: 'Klikk (Pty) Ltd',
        date: '2026-08-16',
        journal_number: 721917,
        amount: '2387.03',
        debit: '2387.03',
        credit: '0.00',
        contact_name: 'BP Dorp Street',
        account_code: '382',
        account_name: 'Fuel Expense',
        description: 'BP Dorp Street: Fuel',
        transaction_source_type: 'Invoice',
      },
      {
        id: 2,
        transaction_source_id: 'invoice-1',
        tenant_name: 'Klikk (Pty) Ltd',
        date: '2026-08-16',
        journal_number: 721917,
        amount: '-2387.03',
        debit: '0.00',
        credit: '-2387.03',
        contact_name: 'BP Dorp Street',
        account_code: '800',
        account_name: 'Accounts Payable',
        transaction_source_type: 'Invoice',
      },
    ],
  });
});

describe('SupplierJournalSearch', () => {
  it('renders Django `results` rows as grouped Xero transactions', async () => {
    const wrapper = mount(SupplierJournalSearch, {
      props: {
        supplier: 'BP Dorp Street',
        receiptDate: '2026-08-17',
        receiptAmount: '2387.03',
      },
    });

    await wrapper.get('button.btn-primary').trigger('click');
    await flushPromises();

    expect(searchMock).toHaveBeenCalledWith({
      contact: 'BP Dorp Street',
      limit: 200,
      offset: 0,
    });
    expect(wrapper.text()).toContain('1 transaction from 2 of 2 matching journal lines');
    expect(wrapper.text()).toContain('Exact amount');
    expect(wrapper.text()).toContain('Fuel Expense');
  });
});
