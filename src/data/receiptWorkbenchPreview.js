import receiptPreviewImage from '../assets/previews/receipt-workbench-sample.png';

const PREVIEW_ROWS = [
  {
    work_item_id: 'receipt-office-crew',
    sha256: 'preview-office-crew-000000000000000000000000000000000000000000000',
    filename: 'PREVIEW-OFFICE-SUPPLIES-2026-06-04.png',
    is_pdf: false,
    view_url: receiptPreviewImage,
    slip_ts: '2026-06-04T13:01:32+02:00',
    slip_date: '2026-06-04',
    fy: 'FY 2026',
    supplier: 'Sample Office Supplies',
    total: '388.00',
    subtotal: '337.39',
    vat: '50.61',
    category: 'Printing and office supplies',
    account_code: '6100',
    account_name: 'Office expenses',
    tax_rate: '15% VAT',
    payment_method: 'Card',
    invoice_number: 'SAMPLE-13840',
    description: 'Office stationery and copy paper',
    status_group: 'NOT IN XERO',
    review: { to_process: true, decision: '' },
    ocr: {
      supplier: 'Sample Office Supply',
      invoice_number: 'SAMPLE-13840',
      date: '2026-06-04',
      subtotal: '337.39',
      vat: '50.61',
      total: '388.00',
      category: 'Printing and office supplies',
      payment_method: 'Card',
    },
    items: [
      { description: 'A4 copy paper and stationery', amount: '388.00', account_code: '6100', tax_rate: '15% VAT' },
    ],
  },
  {
    work_item_id: 'receipt-shell',
    sha256: 'preview-shell-0000000000000000000000000000000000000000000000000',
    filename: 'PREVIEW-SHELL-2026-06-07.jpg',
    is_pdf: false,
    view_url: '',
    slip_ts: '2026-06-07T08:32:00+02:00',
    slip_date: '2026-06-07',
    fy: 'FY 2026',
    supplier: 'Shell Welgevonden',
    total: '1245.60',
    category: 'Fuel',
    status_group: 'NOT IN XERO',
    review: { to_process: true, decision: '' },
  },
  {
    work_item_id: 'receipt-takealot',
    sha256: 'preview-takealot-0000000000000000000000000000000000000000000000',
    filename: 'PREVIEW-TAKEALOT-2026-06-09.pdf',
    is_pdf: true,
    view_url: '',
    slip_ts: '2026-06-09T10:15:00+02:00',
    slip_date: '2026-06-09',
    fy: 'FY 2026',
    supplier: 'Takealot Online',
    total: '2899.00',
    category: 'Equipment',
    status_group: 'NOT IN XERO',
    review: { to_process: true, decision: '' },
  },
  {
    work_item_id: 'receipt-uber',
    sha256: 'preview-uber-000000000000000000000000000000000000000000000000000',
    filename: 'PREVIEW-UBER-2026-06-11.pdf',
    is_pdf: true,
    view_url: '',
    slip_ts: '2026-06-11T18:42:00+02:00',
    slip_date: '2026-06-11',
    fy: 'FY 2026',
    supplier: 'Uber South Africa',
    total: '312.50',
    category: 'Travel',
    status_group: 'NOT IN XERO',
    review: { to_process: true, decision: '' },
  },
  {
    work_item_id: 'receipt-woolworths',
    sha256: 'preview-woolworths-0000000000000000000000000000000000000000000000',
    filename: 'PREVIEW-WOOLWORTHS-2026-06-13.jpg',
    is_pdf: false,
    view_url: '',
    slip_ts: '2026-06-13T12:20:00+02:00',
    slip_date: '2026-06-13',
    fy: 'FY 2026',
    supplier: 'Woolworths Food',
    total: '684.30',
    category: 'Staff refreshments',
    status_group: 'NOT IN XERO',
    review: { to_process: true, decision: '' },
  },
  {
    work_item_id: 'receipt-builders',
    sha256: 'preview-builders-000000000000000000000000000000000000000000000000',
    filename: 'PREVIEW-BUILDERS-2026-06-16.jpg',
    is_pdf: false,
    view_url: '',
    slip_ts: '2026-06-16T09:05:00+02:00',
    slip_date: '2026-06-16',
    fy: 'FY 2026',
    supplier: 'Builders Warehouse',
    total: '1978.45',
    category: 'Repairs and maintenance',
    status_group: 'NOT IN XERO',
    review: { to_process: true, decision: '' },
  },
  {
    work_item_id: 'receipt-city-lodge',
    sha256: 'preview-city-lodge-0000000000000000000000000000000000000000000000',
    filename: 'PREVIEW-CITY-LODGE-2026-06-18.pdf',
    is_pdf: true,
    view_url: '',
    slip_ts: '2026-06-18T07:40:00+02:00',
    slip_date: '2026-06-18',
    fy: 'FY 2026',
    supplier: 'City Lodge Hotel',
    total: '3420.00',
    category: 'Travel',
    status_group: 'NOT IN XERO',
    review: { to_process: true, decision: '' },
  },
];

const PREVIEW_JOURNAL_LINES = [
  {
    id: 'journal-1042-expense', transaction_source_id: 'preview-journal-1042', tenant_id: 'preview-entity',
    tenant_name: 'Klikk (Pty) Ltd', date: '2026-06-04', supplier_name: 'Sample Office Supplies',
    contact_name: 'Sample Office Supplies', reference: 'SAMPLE-13840', journal_number: 1042,
    transaction_source_type: 'Spend money', report: 'Income Statement', account_code: '6100',
    account_name: 'Office expenses', description: 'Office stationery and copy paper', amount: '388.00',
    debit: '388.00', credit: '0.00',
  },
  {
    id: 'journal-1042-bank', transaction_source_id: 'preview-journal-1042', tenant_id: 'preview-entity',
    tenant_name: 'Klikk (Pty) Ltd', date: '2026-06-04', supplier_name: 'Sample Office Supplies',
    contact_name: 'Sample Office Supplies', reference: 'SAMPLE-13840', journal_number: 1042,
    transaction_source_type: 'Spend money', report: 'Balance Sheet', account_code: '090',
    account_name: 'Business bank account', description: 'Card payment', amount: '-388.00',
    debit: '0.00', credit: '388.00',
  },
  {
    id: 'journal-998-expense', transaction_source_id: 'preview-journal-998', tenant_id: 'preview-entity',
    tenant_name: 'Klikk (Pty) Ltd', date: '2026-05-28', supplier_name: 'Sample Office Supplies',
    contact_name: 'Sample Office Supplies', reference: 'STAT-0528', journal_number: 998,
    transaction_source_type: 'Spend money', report: 'Income Statement', account_code: '6100',
    account_name: 'Office expenses', description: 'Printing paper', amount: '402.75', debit: '402.75', credit: '0.00',
  },
  {
    id: 'journal-998-bank', transaction_source_id: 'preview-journal-998', tenant_id: 'preview-entity',
    tenant_name: 'Klikk (Pty) Ltd', date: '2026-05-28', supplier_name: 'Sample Office Supplies',
    contact_name: 'Sample Office Supplies', reference: 'STAT-0528', journal_number: 998,
    transaction_source_type: 'Spend money', report: 'Balance Sheet', account_code: '090',
    account_name: 'Business bank account', description: 'Card payment', amount: '-402.75', debit: '0.00', credit: '402.75',
  },
];

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function previewRows(params = {}) {
  const query = normalized(params.q);
  const filtered = query
    ? PREVIEW_ROWS.filter((row) => [row.supplier, row.filename, row.category].some((value) => normalized(value).includes(query)))
    : PREVIEW_ROWS;
  const desc = String(params.ordering || '-slip_ts').startsWith('-');
  const key = String(params.ordering || '-slip_ts').replace(/^-/, '');
  return [...filtered].sort((a, b) => {
    const left = key === 'total' ? Number(a[key]) : normalized(a[key]);
    const right = key === 'total' ? Number(b[key]) : normalized(b[key]);
    if (left === right) return 0;
    const result = left > right ? 1 : -1;
    return desc ? -result : result;
  });
}

export async function getPreviewReceipts(params = {}) {
  const allRows = previewRows(params);
  const pageSize = Math.max(1, Number(params.page_size) || 50);
  const page = Math.max(1, Number(params.page) || 1);
  const start = (page - 1) * pageSize;
  const results = allRows.slice(start, start + pageSize).map((row) => ({ ...row }));
  const sumTotal = allRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0).toFixed(2);
  return { count: allRows.length, page, page_size: pageSize, totals: { count: allRows.length, sum_total: sumTotal }, results };
}

export async function getPreviewReceipt(sha256) {
  const row = PREVIEW_ROWS.find((item) => item.sha256 === sha256);
  if (!row) throw new Error('Preview receipt not found');
  return { ...row, comments: [] };
}

export async function patchPreviewReceiptReview(_sha256, body) {
  return { to_process: body.to_process !== false, decision: body.decision || '', updated_at: new Date().toISOString() };
}

export async function searchPreviewJournals({ contact = '', limit = 200, offset = 0 } = {}) {
  const query = normalized(contact);
  const matches = PREVIEW_JOURNAL_LINES.filter((line) => normalized(line.contact_name).includes(query));
  return { count: matches.length, results: matches.slice(offset, offset + limit).map((line) => ({ ...line })) };
}

