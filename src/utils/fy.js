/**
 * fy.js — Klikk fiscal-year helpers.
 *
 * Klikk's FY starts 1 July: FY N = 1 Jul (N-1) .. 30 Jun N, so
 * 2026-06-30 is in FY2026 and 2026-07-01 is in FY2027. Mirrors the backend's
 * apps/audit/services.py fy_bounds() / fiscal_year_for_today().
 *
 * Timezone note: everything here reads LOCAL calendar fields
 * (getFullYear/getMonth) and builds date strings by arithmetic — never by
 * slicing an ISO string, which is UTC-based and would put a SAST evening on
 * 30 Jun / 1 Jul into the wrong FY.
 */

/** First month of the fiscal year (1-based). July. */
export const FY_START_MONTH = 7;

/**
 * The FY that `today` falls in, as the FY's END year.
 * currentFy(new Date(2026, 5, 30)) → 2026; currentFy(new Date(2026, 6, 1)) → 2027.
 */
export function currentFy(today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-based
  return month >= FY_START_MONTH ? year + 1 : year;
}

/** 2026 → 'FY2026 (Jul 2025 – Jun 2026)'. '' for non-numeric input. */
export function fyLabel(fy) {
  const n = Number(fy);
  if (!Number.isInteger(n)) return '';
  return `FY${n} (Jul ${n - 1} – Jun ${n})`;
}

/** 2026 → { start: '2025-07-01', end: '2026-06-30' }. null for non-numeric input. */
export function fyRange(fy) {
  const n = Number(fy);
  if (!Number.isInteger(n)) return null;
  return { start: `${n - 1}-07-01`, end: `${n}-06-30` };
}
