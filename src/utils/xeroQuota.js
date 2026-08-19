// Xero API quota — label, tone and tooltip for the daily-call budget pill.
//
// Why this module exists:
//   1. The console used to render `total_today / 5,000`. `total_today` is our
//      OWN tally — only calls written to XeroApiCallLog by the process runners.
//      Probes, backfills and one-shot scripts never log, so the pill read "0"
//      while Xero itself reported ~54 calls used. The backend now persists
//      Xero's own X-DayLimit-Remaining / X-MinLimit-Remaining response headers
//      per tenant and exposes them as `quota` on GET /xero/sync/api-call-stats/.
//      When that truth is available we show it (with a ≈, because it is
//      remaining-count arithmetic, not a ledger); when it is not, we show the
//      logged tally and SAY SO.
//   2. The Klikk tenant's real cap is 1,000 calls/day, not 5,000. It is a fixed
//      daily window that resets at ~16:26 SAST (~14:26 UTC). The cap comes from
//      the API response (`cap` / `quota.cap`); 1,000 is only the fallback.
//
// This module is pure and total: no Vue imports, never throws, and tolerates
// null / undefined / partial responses (older backends omit `quota` and `cap`).
//
// Response shape (current backend):
//   {
//     by_process: { metadata: { last_run: 4, today: 12 }, ... },
//     total_today: 162,
//     cap: 1000,
//     quota: {
//       cap: 1000, day_remaining: 946, min_remaining: 59, used_estimate: 54,
//       seen_at: '2026-08-19T20:41:03.221Z', last_status: 200, tenant_id: '…'
//     }
//   }
// When Xero headers have never been seen for the tenant, every `quota` field
// except `cap` is null.

/** Cap used when the response carries no cap at all. Klikk tenant = 1,000/day. */
export const XERO_QUOTA_FALLBACK_CAP = 1000;

/** Tooltip when the pill shows Xero's own header-derived count. */
export const QUOTA_TOOLTIP =
  "Read from Xero's X-DayLimit-Remaining response header — Xero's own count, not ours. " +
  'Fixed daily window, resets ~16:26 SAST.';

/** Tooltip when the pill can only show our logged tally (no header seen yet). */
export const QUOTA_TOOLTIP_FALLBACK =
  'Counts only calls logged by the process runners — probes, backfills and one-shot ' +
  "scripts are not included, so Xero's own count is higher. Switches to Xero's " +
  'X-DayLimit-Remaining header once a sync has run. Fixed daily window, resets ~16:26 SAST.';

// ── Internals ─────────────────────────────────────────────────────────────────

function finiteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local wall-clock HH:mm (24h, zero-padded). Browser/host timezone — never hard-coded. */
function defaultFormatTime(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Daily cap: response `cap`, else `quota.cap`, else the fallback. Always a positive number. */
export function resolveCap(stats) {
  const cap = finiteNumber(stats?.cap) ?? finiteNumber(stats?.quota?.cap);
  return cap !== null && cap > 0 ? cap : XERO_QUOTA_FALLBACK_CAP;
}

/**
 * True when the response carries Xero's own header reading: `quota.seen_at`
 * parses as a date AND `quota.day_remaining` is a finite number.
 */
export function hasHeaderTruth(stats) {
  const q = stats?.quota;
  if (!q || typeof q !== 'object') return false;
  return parseDate(q.seen_at) !== null && finiteNumber(q.day_remaining) !== null;
}

/**
 * Calls used today, in the unit the label shows:
 *   truth mode    → `quota.used_estimate` (or cap − day_remaining if absent)
 *   fallback mode → `total_today` (logged calls only)
 * Never negative, never NaN.
 */
export function usedToday(stats) {
  let used;
  if (hasHeaderTruth(stats)) {
    used = finiteNumber(stats.quota.used_estimate)
      ?? (resolveCap(stats) - finiteNumber(stats.quota.day_remaining));
  } else {
    used = finiteNumber(stats?.total_today) ?? 0;
  }
  return Math.max(0, used);
}

/**
 * Quota summary without the "Xero API: " prefix — for inline use next to other
 * copy (e.g. the API-history disclosure trigger).
 *
 *   truth mode    → "≈54 / 1,000 today · 946 left · as of 20:41"
 *   fallback mode → "162 / 1,000 today (logged calls only)"
 *   degenerate    → "0 / 1,000 today (logged calls only)"
 *
 * `≈` marks Xero's remaining-count arithmetic; the fallback number is exact
 * for what it measures, so it carries no ≈ — the parenthetical is what keeps
 * it honest. `as of` is the LOCAL time of `quota.seen_at`.
 *
 * @param {object|null|undefined} stats  api-call-stats response
 * @param {{ formatTime?: (d: Date) => string }} [opts]  seam for deterministic
 *        tests — receives the parsed `seen_at` Date, returns the "as of" text.
 */
export function formatQuotaSummary(stats, { formatTime = defaultFormatTime } = {}) {
  const cap = resolveCap(stats);
  const used = usedToday(stats);

  if (hasHeaderTruth(stats)) {
    const left = Math.max(0, finiteNumber(stats.quota.day_remaining));
    const seenAt = parseDate(stats.quota.seen_at);
    return `≈${used.toLocaleString()} / ${cap.toLocaleString()} today · ` +
      `${left.toLocaleString()} left · as of ${formatTime(seenAt)}`;
  }

  return `${used.toLocaleString()} / ${cap.toLocaleString()} today (logged calls only)`;
}

/**
 * Pill label — "Xero API: " + formatQuotaSummary().
 *
 *   truth mode    → "Xero API: ≈54 / 1,000 today · 946 left · as of 20:41"
 *   fallback mode → "Xero API: 162 / 1,000 today (logged calls only)"
 *   degenerate    → "Xero API: 0 / 1,000 today (logged calls only)"
 */
export function formatQuotaLabel(stats, opts) {
  return `Xero API: ${formatQuotaSummary(stats, opts)}`;
}

/**
 * StatusPill tone, proportional to the resolved cap:
 *   error   ≥ 100 % used
 *   warning ≥  80 % used
 *   info    otherwise
 */
export function quotaTone(stats) {
  const ratio = usedToday(stats) / resolveCap(stats);
  if (ratio >= 1) return 'error';
  if (ratio >= 0.8) return 'warning';
  return 'info';
}

/** Tooltip text matching the mode the label is in — never claims header-truth in fallback. */
export function quotaTooltip(stats) {
  return hasHeaderTruth(stats) ? QUOTA_TOOLTIP : QUOTA_TOOLTIP_FALLBACK;
}
