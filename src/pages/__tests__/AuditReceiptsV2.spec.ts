// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('../../api/receipts', () => ({
  getReceipts: vi.fn(),
  getReceipt: vi.fn(),
  patchReceiptReview: vi.fn(),
}));

vi.mock('../../api/xeroJournals', () => ({
  searchXeroJournals: vi.fn(),
}));

const routerReplace = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: routerReplace }),
}));

import * as receiptsApi from '../../api/receipts';
import * as journalsApi from '../../api/xeroJournals';
import AuditReceiptsV2 from '../AuditReceiptsV2.vue';

const receiptMocks = receiptsApi as unknown as {
  getReceipts: ReturnType<typeof vi.fn>;
  getReceipt: ReturnType<typeof vi.fn>;
  patchReceiptReview: ReturnType<typeof vi.fn>;
};
const journalMocks = journalsApi as unknown as {
  searchXeroJournals: ReturnType<typeof vi.fn>;
};

const ROW = {
  sha256: 'a'.repeat(64),
  filename: 'bp.jpg',
  is_pdf: false,
  view_url: '/backend/audit/receipts/aaaa/view/',
  slip_ts: '2026-08-17T09:00:00Z',
  slip_date: '2026-08-17',
  fy: 'FY27',
  supplier: 'BP Dorp Street',
  total: '2387.03',
  category: 'Fuel',
  status_group: 'NOT IN XERO',
  review: { to_process: true, decision: '' },
};

function mountPage() {
  return mount(AuditReceiptsV2, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  routerReplace.mockReset();
  receiptMocks.getReceipts.mockReset().mockResolvedValue({
    count: 1,
    totals: { count: 1, sum_total: '2387.03' },
    results: [ROW],
  });
  receiptMocks.getReceipt.mockReset().mockResolvedValue({
    ...ROW,
    ocr: { supplier: 'BP Dorp St', total: '2387.03' },
    items: [{ description: 'Fuel', amount: '2387.03' }],
  });
  receiptMocks.patchReceiptReview.mockReset().mockResolvedValue({
    to_process: true,
    decision: 'CAPTURE',
  });
  journalMocks.searchXeroJournals.mockReset().mockResolvedValue({ count: 0, results: [] });
});

describe('AuditReceiptsV2', () => {
  it('shows receipt information beside the image and unlocks changes with the edit button', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Receipts V2');
    expect(wrapper.text()).toContain('Open original Receipts');
    expect(wrapper.text()).toContain('BP Dorp Street');

    await wrapper.find('tbody tr').trigger('click');
    await flushPromises();

    expect(receiptMocks.getReceipt).toHaveBeenCalledWith(ROW.sha256);
    expect(wrapper.text()).toContain('Receipt information');
    expect(wrapper.text()).toContain('Supplier journals in Xero');
    expect(wrapper.find('.rv2-receipt-workspace').exists()).toBe(true);

    const supplier = wrapper.find('form.rrf input[type="text"]');
    expect((supplier.element as HTMLInputElement).value).toBe('BP Dorp Street');
    expect(supplier.attributes('readonly')).toBeDefined();

    const edit = wrapper.findAll('button').find((button) => button.text() === 'Edit information');
    expect(edit).toBeTruthy();
    await edit!.trigger('click');
    expect(supplier.attributes('readonly')).toBeUndefined();

    await supplier.setValue('Changed supplier');
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancel');
    await cancel!.trigger('click');
    expect((wrapper.find('form.rrf input[type="text"]').element as HTMLInputElement).value).toBe('BP Dorp Street');
    expect(wrapper.find('form.rrf input[type="text"]').attributes('readonly')).toBeDefined();

    wrapper.unmount();
  });

  it('saves a local correction and requires an explicit confirmation before marking capture', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('tbody tr').trigger('click');
    await flushPromises();

    const edit = wrapper.findAll('button').find((button) => button.text() === 'Edit information');
    await edit!.trigger('click');
    expect(wrapper.text()).toContain('Save changes');
    await wrapper.find('form.rrf').trigger('submit');
    await flushPromises();
    expect(localStorage.getItem('klikk.receipts-v2.correction-drafts.v1')).toContain(ROW.sha256);
    expect(receiptMocks.patchReceiptReview).not.toHaveBeenCalled();

    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Confirm missing from Xero');
    expect(confirm).toBeTruthy();
    await confirm!.trigger('click');
    await flushPromises();

    expect(receiptMocks.patchReceiptReview).toHaveBeenCalledWith(ROW.sha256, {
      to_process: true,
      decision: 'CAPTURE',
    });
    wrapper.unmount();
  });
});
