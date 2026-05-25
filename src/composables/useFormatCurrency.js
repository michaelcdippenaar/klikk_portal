/**
 * useFormatCurrency — Klikk ADR-locked number formatting composable.
 *
 * ADR: docs/decisions/negative-numbers.md
 *
 * API:
 *   const { format, formatRaw } = useFormatCurrency()
 *
 *   format(value, { mode: 'accounting' | 'operational' })
 *     accounting  → parentheses for negatives: (1,234.56) | positives: 1,234.56 | zero: 0.00
 *     operational → leading minus for negatives: -12        | positives: 12       | zero: 0
 *
 *   formatRaw(value)
 *     Returns the raw signed number string for CSV/XLSX export: -1234.56
 *     No thousands separators, no localisation, no symbol.
 */

/**
 * Thousands-separate an absolute numeric string using comma separator (en-ZA convention).
 * Input: '1234567.89' → Output: '1,234,567.89'
 * @param {string} str
 * @returns {string}
 */
function addThousands(str) {
  const [integer, decimal] = str.split('.');
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal !== undefined ? `${formatted}.${decimal}` : formatted;
}

/**
 * @returns {{ format: (value: number|string|null|undefined, options?: { mode?: string }) => string, formatRaw: (value: number|string|null|undefined) => string }}
 */
export function useFormatCurrency() {
  /**
   * Format a numeric value for display.
   * @param {number|string|null|undefined} value
   * @param {{ mode?: 'accounting' | 'operational' }} [options]
   * @returns {string}
   */
  function format(value, options) {
    const mode = (options && options.mode) || 'accounting';

    if (value === null || value === undefined || value === '') return '';

    const num = Number(value);
    if (Number.isNaN(num)) return '';

    if (mode === 'accounting') {
      // Zero → 0.00
      if (num === 0) return '0.00';

      const abs = Math.abs(num);
      // Fixed 2 decimal places, comma thousands
      const absStr = abs.toFixed(2);
      const formatted = addThousands(absStr);

      return num < 0 ? `(${formatted})` : formatted;
    }

    // operational mode
    if (num === 0) return '0';
    // No thousands separators, no decimals for whole numbers
    const isWhole = num % 1 === 0;
    if (isWhole) return String(Math.round(num));
    return String(num);
  }

  /**
   * Return the raw signed value as a string — for CSV/XLSX export.
   * No thousands separators, no parentheses, no currency symbol.
   * @param {number|string|null|undefined} value
   * @returns {string}
   */
  function formatRaw(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (Number.isNaN(num)) return '';
    // Preserve decimal precision up to the raw value's representation
    return String(num);
  }

  return { format, formatRaw };
}
