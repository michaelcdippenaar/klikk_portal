function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '') ?? '';
}

function inputDecimal(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number.toFixed(2) : '';
}

function dateOnly(value) {
  if (!value) return '';
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

export function receiptToCorrectionDraft(receipt = {}) {
  const ocr = receipt.ocr && typeof receipt.ocr === 'object' ? receipt.ocr : {};
  const items = Array.isArray(receipt.items) ? receipt.items : (Array.isArray(ocr.items) ? ocr.items : []);

  return {
    supplier: String(firstValue(receipt.supplier, ocr.supplier, ocr.vendor, '')),
    invoice_number: String(firstValue(
      receipt.invoice_number,
      ocr.invoice_number,
      ocr.receipt_number,
      ocr.reference,
      '',
    )),
    receipt_date: dateOnly(firstValue(receipt.slip_date, ocr.slip_date, ocr.date, receipt.slip_ts)),
    due_date: dateOnly(firstValue(receipt.due_date, ocr.due_date, '')),
    description: String(firstValue(receipt.description, ocr.description, '')),
    category: String(firstValue(receipt.category, ocr.category, '')),
    account_code: String(firstValue(receipt.account_code, ocr.account_code, '')),
    account_name: String(firstValue(receipt.account_name, ocr.account_name, '')),
    tax_rate: String(firstValue(receipt.tax_rate, ocr.tax_rate, '')),
    tracking_1: String(firstValue(receipt.tracking_1, ocr.tracking_1, '')),
    tracking_2: String(firstValue(receipt.tracking_2, ocr.tracking_2, '')),
    payment_method: String(firstValue(receipt.payment_method, ocr.payment_method, '')),
    subtotal: inputDecimal(firstValue(receipt.subtotal, ocr.subtotal, '')),
    vat: inputDecimal(firstValue(receipt.vat, receipt.tax_total, ocr.vat, ocr.tax_total, '')),
    total: inputDecimal(firstValue(receipt.total, ocr.total, '')),
    line_items: items.map((item = {}) => ({
      description: String(firstValue(item.description, item.name, '')),
      amount: inputDecimal(firstValue(item.amount, item.total, '')),
      account_code: String(firstValue(item.account_code, '')),
      tax_rate: String(firstValue(item.tax_rate, '')),
    })),
  };
}

export function validateCorrectionDraft(draft = {}) {
  const errors = {};
  if (!String(draft.supplier || '').trim()) errors.supplier = 'Supplier is required.';
  if (!String(draft.receipt_date || '').trim()) errors.receipt_date = 'Receipt date is required.';

  const total = Number(draft.total);
  if (!String(draft.total || '').trim()) errors.total = 'Total is required.';
  else if (!Number.isFinite(total) || total < 0) errors.total = 'Enter a valid total.';

  const subtotalPresent = String(draft.subtotal || '').trim() !== '';
  const vatPresent = String(draft.vat || '').trim() !== '';
  if (subtotalPresent || vatPresent) {
    const subtotal = Number(draft.subtotal || 0);
    const vat = Number(draft.vat || 0);
    if (!Number.isFinite(subtotal)) errors.subtotal = 'Enter a valid subtotal.';
    if (!Number.isFinite(vat)) errors.vat = 'Enter a valid VAT amount.';
    if (Number.isFinite(total) && Number.isFinite(subtotal) && Number.isFinite(vat)
      && Math.abs((subtotal + vat) - total) > 0.02) {
      errors.total = 'Subtotal and VAT do not add up to the total.';
    }
  }

  return errors;
}

function candidateAmount(lines) {
  const preferred = lines.find((line) =>
    String(line.report || '').toLowerCase() === 'income statement'
    && Number(line.amount) > 0);
  if (preferred) return Number(preferred.amount);

  const values = lines.map((line) => Math.abs(Number(line.amount))).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function dateDistance(date, receiptDate) {
  if (!date || !receiptDate) return Number.POSITIVE_INFINITY;
  const a = new Date(`${date}T00:00:00`).getTime();
  const b = new Date(`${receiptDate}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / 86400000;
}

/** Group mirror rows into one economic Xero transaction for manual review. */
export function groupJournalLines(lines = [], receipt = {}) {
  const groups = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const key = line.transaction_source_id
      || `${line.tenant_id || line.tenant_name || ''}:${line.date || ''}:${line.reference || ''}:${line.journal_number || line.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }

  const receiptTotal = Number(receipt.total);
  const receiptDate = receipt.receipt_date || receipt.slip_date || '';

  return [...groups.entries()].map(([id, groupLines]) => {
    const amount = candidateAmount(groupLines);
    const first = groupLines[0] || {};
    const accounts = [...new Set(groupLines
      .filter((line) => line.account_code || line.account_name)
      .map((line) => [line.account_code, line.account_name].filter(Boolean).join(' · ')))];
    const journalNumbers = [...new Set(groupLines.map((line) => line.journal_number).filter(Boolean))];
    const amountDelta = Number.isFinite(receiptTotal) && Number.isFinite(amount)
      ? Math.abs(amount - receiptTotal)
      : null;
    return {
      id,
      tenant_name: first.tenant_name || 'Unknown organisation',
      date: first.date || '',
      supplier_name: first.supplier_name || first.contact_name || '',
      reference: first.reference || '',
      source_type: first.transaction_source_type || first.journal_type || 'Journal',
      amount,
      amount_delta: amountDelta,
      date_distance: dateDistance(first.date, receiptDate),
      accounts,
      journal_numbers: journalNumbers,
      lines: groupLines,
    };
  }).sort((a, b) => {
    const amountA = a.amount_delta ?? Number.POSITIVE_INFINITY;
    const amountB = b.amount_delta ?? Number.POSITIVE_INFINITY;
    if (amountA !== amountB) return amountA - amountB;
    if (a.date_distance !== b.date_distance) return a.date_distance - b.date_distance;
    return String(b.date).localeCompare(String(a.date));
  });
}
