/**
 * useFormatCurrency — Vitest spec
 * Covers the six cases locked by the negative-numbers ADR.
 * docs/decisions/negative-numbers.md
 */
import { describe, it, expect } from 'vitest';
import { useFormatCurrency } from '../useFormatCurrency.js';

const { format, formatRaw } = useFormatCurrency();

describe('useFormatCurrency', () => {
  // ADR case 1: positive value, accounting mode
  it('formats positive values without parentheses (accounting)', () => {
    expect(format(1234.56, { mode: 'accounting' })).toBe('1,234.56');
  });

  // ADR case 2: negative value, accounting mode — parentheses, no minus, no red
  it('formats negative values with parentheses (accounting)', () => {
    expect(format(-1234.56, { mode: 'accounting' })).toBe('(1,234.56)');
  });

  // ADR case 3: zero, accounting mode
  it('formats zero as 0.00 (accounting)', () => {
    expect(format(0, { mode: 'accounting' })).toBe('0.00');
  });

  // ADR case 4: operational mode — leading minus, no parentheses
  it('formats negative with leading minus (operational)', () => {
    expect(format(-12, { mode: 'operational' })).toBe('-12');
  });

  // ADR case 5: zero, operational mode
  it('formats zero as 0 (operational)', () => {
    expect(format(0, { mode: 'operational' })).toBe('0');
  });

  // ADR case 6: CSV raw form — signed, no separators, no symbol
  it('formatRaw returns signed raw number string for CSV export', () => {
    expect(formatRaw(-1234.56)).toBe('-1234.56');
    expect(formatRaw(1234.56)).toBe('1234.56');
    expect(formatRaw(0)).toBe('0');
  });

  // Additional coverage
  it('defaults to accounting mode when no options passed', () => {
    expect(format(-500)).toBe('(500.00)');
  });

  it('handles null and undefined gracefully', () => {
    expect(format(null)).toBe('');
    expect(format(undefined)).toBe('');
    expect(formatRaw(null)).toBe('');
    expect(formatRaw(undefined)).toBe('');
  });

  it('formats large numbers with thousands separators (accounting)', () => {
    expect(format(1000000)).toBe('1,000,000.00');
    expect(format(-1000000)).toBe('(1,000,000.00)');
  });

  it('formats positive values without plus sign (operational)', () => {
    expect(format(42, { mode: 'operational' })).toBe('42');
  });
});
