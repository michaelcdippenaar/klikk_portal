/**
 * receipts.js — pure helpers for the Audit → Receipts console page.
 *
 * Everything in here is side-effect free and importable from unit tests
 * without mounting AuditReceipts.vue:
 *   - option lists for the FilterBar selects
 *   - FY bucketing / label (Klikk FY N = 1 Jul (N-1) .. 30 Jun N)
 *   - currency / date / datetime formatting
 *   - status_group → StatusPill tone / label
 *   - hydrateFromQuery() / buildRouteQuery() — the URL ⇄ filter-state contract
 *
 * NOTE on `decision`: the decision control was removed from the UI (2026-08-20)
 * but the enum, the label helper and the filter plumbing stay — the model field
 * and the API parameter are unchanged and still carry existing data, and other
 * callers of the bulk endpoint rely on the contract.
 */

// ── Constants ───────────────────────────────────────────────────────────────

/** Sentinel used by KSelect for "no filter" (reka-ui rejects '' item values). */
export const ALL = '__all__';
/** Sentinel used by the row-level decision KSelect for "no decision". */
export const NONE = '__none__';

export const DEFAULT_PAGE_SIZE = 50;
/**
 * 200 is the backend's hard ceiling (services.MAX_PAGE_SIZE); a larger
 * page_size is clamped there, not rejected, so never offer one — the table
 * would silently disagree with the row count it just asked for.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

/** Klikk fiscal year starts 1 July (see apps/audit/services.py fy_bounds). */
export const FY_START_MONTH = 7;

export const FY_OPTIONS = [
  { value: ALL, label: 'All years' },
  { value: 'FY25', label: 'FY25' },
  { value: 'FY26', label: 'FY26' },
  { value: 'FY27', label: 'FY27' },
];

export const SYNCED_OPTIONS = [
  { value: ALL, label: 'All' },
  { value: 'true', label: 'Synced' },
  { value: 'false', label: 'Not synced' },
];

export const STATUS_OPTIONS = [
  { value: ALL, label: 'All statuses' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'NOT IN XERO', label: 'Not in Xero' },
  { value: 'SKIPPED', label: 'Skipped' },
];

export const TO_PROCESS_OPTIONS = [
  { value: ALL, label: 'All' },
  { value: 'true', label: 'Flagged to process' },
  { value: 'false', label: 'Not flagged' },
];

/**
 * Review decisions — the fixed product-spec enum. These literal strings are
 * what PATCH /audit/receipts/<sha256>/review/ accepts and what the API returns
 * in `review.decision`. '' = undecided (not yet set).
 */
export const DECISION_VALUES = [
  { value: '', label: '—' },
  { value: 'CAPTURE', label: 'Capture' },
  { value: 'MEAL_SKIP', label: 'Meal (skip)' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'DUPLICATE', label: 'Duplicate' },
  { value: 'ALREADY_IN_XERO', label: 'Already in Xero' },
];

/**
 * Literal query-param value the list endpoint accepts for "decision not yet
 * set". Sent as `decision=NONE` (never `decision=`).
 */
export const DECISION_FILTER_UNDECIDED = 'NONE';

/** Decision filter options (FilterBar) — ALL sentinel, Undecided, then every enum value. */
export const DECISION_FILTER_OPTIONS = [
  { value: ALL, label: 'All decisions' },
  { value: DECISION_FILTER_UNDECIDED, label: 'Undecided' },
  ...DECISION_VALUES.filter((d) => d.value !== '').map((d) => ({ value: d.value, label: d.label })),
];

/**
 * Archived filter — THREE-WAY, and the default is not "no filter".
 *
 * Archiving takes a receipt out of the working list without deleting anything,
 * so the whole point is that the list EXCLUDES archived rows unless asked. The
 * ALL sentinel is deliberately not used here: '__all__' would read as "no
 * filter", and the default state is a real filter.
 *
 * Values are the literal strings the API accepts on `?archived=`:
 *   'hide'  — default; the param is omitted and the server excludes archived
 *   'true'  — archived rows only
 *   'all'   — both
 */
export const ARCHIVED_HIDE = 'hide';
export const ARCHIVED_ONLY = 'true';
export const ARCHIVED_ALL = 'all';

export const ARCHIVED_OPTIONS = [
  { value: ARCHIVED_HIDE, label: 'Hide archived' },
  { value: ARCHIVED_ONLY, label: 'Archived only' },
  { value: ARCHIVED_ALL, label: 'Incl. archived' },
];

const ARCHIVED_VALUES = ARCHIVED_OPTIONS.map((o) => o.value);

/** Decision options for the row/detail KSelect — NONE sentinel stands in for ''. */
export const DECISION_SELECT_OPTIONS = DECISION_VALUES.map((d) => ({
  value: d.value === '' ? NONE : d.value,
  label: d.label,
}));

// ── Formatters ──────────────────────────────────────────────────────────────

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce input to a Date, or null when unparsable.
 *
 * Date-only 'YYYY-MM-DD' strings are parsed as LOCAL calendar dates. The spec
 * makes `new Date("YYYY-MM-DD")` UTC midnight, which in any UTC-negative
 * timezone reads back as the previous evening via getMonth()/getDate() — a
 * 1 Jul receipt would then land in the wrong FY. Full ISO timestamps (the
 * API's timestamptz values) keep their instant-based behaviour.
 */
function toLocalDate(input) {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'string' && DATE_ONLY_RE.test(input)) {
    const [y, m, day] = input.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    // Reject rolled-over values like '2026-13-45'.
    if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
    return d;
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Fiscal-year label for a date. Klikk FY N runs 1 Jul (N-1) .. 30 Jun N,
 * so 2026-08-04 → 'FY27' and 2026-05-01 → 'FY26'.
 * Returns '' for null / unparsable input.
 */
export function fyForDate(input, startMonth = FY_START_MONTH) {
  if (!input) return '';
  const d = toLocalDate(input);
  if (!d) return '';
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const fyEnd = startMonth === 1 || month < startMonth ? year : year + 1;
  return fyLabel(fyEnd);
}

/** 2026 → 'FY26'. Accepts number or numeric string; '' for anything else. */
export function fyLabel(fyEndYear) {
  if (fyEndYear === null || fyEndYear === undefined || fyEndYear === '') return '';
  const n = Number(fyEndYear);
  if (!Number.isFinite(n)) return '';
  return `FY${String(n).slice(-2)}`;
}

/**
 * Currency (ZAR, en-ZA). null / undefined / non-numeric → '—'.
 * Accepts the API's string decimals ("21600.00").
 */
export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** ISO date / datetime → 'YYYY-MM-DD'. Invalid / empty → '—'. */
export function formatDateShort(input) {
  if (!input) return '—';
  const d = toLocalDate(input);
  if (!d) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO datetime → 'YYYY-MM-DD HH:mm' (local). Invalid / empty → '—'. */
export function formatDateTime(input) {
  if (!input) return '—';
  const d = toLocalDate(input);
  if (!d) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDateShort(d)} ${hh}:${mm}`;
}

/** Bytes → human size ('12.1 KB'). */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || bytes === '') return '—';
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Status mapping ──────────────────────────────────────────────────────────

/** status_group → StatusPill tone. */
export function statusTone(statusGroup) {
  switch (String(statusGroup || '').toUpperCase()) {
    case 'MATCHED': return 'success';
    case 'PENDING': return 'warning';
    case 'NOT IN XERO': return 'error';
    case 'SKIPPED': return 'neutral';
    default: return 'neutral';
  }
}

/** status_group → human label. */
export function statusLabel(statusGroup) {
  switch (String(statusGroup || '').toUpperCase()) {
    case 'MATCHED': return 'Matched';
    case 'PENDING': return 'Pending';
    case 'NOT IN XERO': return 'Not in Xero';
    case 'SKIPPED': return 'Skipped';
    default: return statusGroup ? String(statusGroup) : 'Unknown';
  }
}

/** Decision value → label ('' / null → 'Undecided'; unknown → raw value). */
export function decisionLabel(value) {
  const v = value == null ? '' : String(value);
  if (v === '') return 'Undecided';
  const found = DECISION_VALUES.find((d) => d.value === v);
  return found ? found.label : v;
}

// ── URL sync ────────────────────────────────────────────────────────────────

/**
 * Default filter state. `page` is 1-based (matches the API and the URL).
 */
export function defaultFilters() {
  return {
    q: '',
    fy: ALL,
    synced: ALL,
    status: ALL,
    to_process: ALL,
    decision: ALL,
    archived: ARCHIVED_HIDE,
    date_from: '',
    date_to: '',
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  };
}

function pickString(q, key) {
  const v = q[key];
  if (Array.isArray(v)) return v.length ? String(v[0]) : '';
  return v == null ? '' : String(v);
}

/**
 * Read route.query into a fresh filter state. Pure — does NOT mutate.
 * Unknown / empty params fall back to defaults.
 */
export function hydrateFromQuery(q = {}) {
  const f = defaultFilters();
  const str = (k) => pickString(q, k);

  if (str('q')) f.q = str('q');
  if (str('fy')) f.fy = str('fy');
  if (['true', 'false'].includes(str('synced'))) f.synced = str('synced');
  if (str('status')) f.status = str('status');
  if (['true', 'false'].includes(str('to_process'))) f.to_process = str('to_process');
  if (str('decision')) f.decision = str('decision');
  // Only the two non-default values are honoured; anything else (incl. a
  // hand-typed 'archived=banana') falls back to hiding archived rows, which is
  // the same thing the server does with an unrecognised value.
  if (ARCHIVED_VALUES.includes(str('archived'))) f.archived = str('archived');
  if (str('date_from')) f.date_from = str('date_from');
  if (str('date_to')) f.date_to = str('date_to');

  const page = Number(str('page'));
  if (Number.isFinite(page) && page > 1) f.page = Math.floor(page);

  const size = Number(str('page_size'));
  if (PAGE_SIZE_OPTIONS.includes(size)) f.page_size = size;

  return f;
}

/**
 * Serialise filter state into the query object passed to router.replace().
 * Omits empty / default values so a clean page has an empty query string.
 */
export function buildRouteQuery(f) {
  const query = {};
  if (f.q) query.q = f.q;
  if (f.fy && f.fy !== ALL) query.fy = f.fy;
  if (f.synced && f.synced !== ALL) query.synced = f.synced;
  if (f.status && f.status !== ALL) query.status = f.status;
  if (f.to_process && f.to_process !== ALL) query.to_process = f.to_process;
  if (f.decision && f.decision !== ALL) query.decision = f.decision;
  if (f.archived && f.archived !== ARCHIVED_HIDE) query.archived = f.archived;
  if (f.date_from) query.date_from = f.date_from;
  if (f.date_to) query.date_to = f.date_to;
  if (Number(f.page) > 1) query.page = String(f.page);
  if (Number(f.page_size) && Number(f.page_size) !== DEFAULT_PAGE_SIZE) {
    query.page_size = String(f.page_size);
  }
  return query;
}

/**
 * Filter state → API params for GET /audit/receipts/ (and /export/).
 * Sentinels are dropped; booleans are sent as 'true'/'false' strings.
 */
export function buildApiParams(f, { includePaging = true } = {}) {
  const params = {};
  if (f.q) params.q = f.q;
  if (f.fy && f.fy !== ALL) params.fy = f.fy;
  if (f.synced && f.synced !== ALL) params.synced = f.synced;
  if (f.status && f.status !== ALL) params.status = f.status;
  if (f.to_process && f.to_process !== ALL) params.to_process = f.to_process;
  if (f.decision && f.decision !== ALL) params.decision = f.decision;
  // 'hide' is the server's default behaviour, so it is sent as nothing at all.
  if (f.archived && f.archived !== ARCHIVED_HIDE) params.archived = f.archived;
  if (f.date_from) params.date_from = f.date_from;
  if (f.date_to) params.date_to = f.date_to;
  if (includePaging) {
    params.page = Number(f.page) > 0 ? Number(f.page) : 1;
    params.page_size = Number(f.page_size) || DEFAULT_PAGE_SIZE;
  }
  return params;
}

/** True when any non-paging filter differs from its default. */
export function hasActiveFilters(f) {
  const d = defaultFilters();
  return ['q', 'fy', 'synced', 'status', 'to_process', 'decision', 'archived', 'date_from', 'date_to']
    .some((k) => f[k] !== d[k]);
}
