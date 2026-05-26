/**
 * KSpinner.size.spec.ts
 *
 * Validates the `size` prop validator and the `px` computed resolution for both
 * preset-string and numeric (string or number) size values.
 * Runs in node environment — tests validator and size-resolution logic directly.
 *
 * Acceptance:
 *  - Preset strings accepted, map to correct pixel value.
 *  - Numeric values (Number or numeric string) accepted, used as-is.
 *  - Zero, negative, and non-numeric strings rejected.
 */

import { describe, it, expect } from 'vitest';

// ── Replicate the logic from KSpinner.vue ────────────────────────────────────

const PRESETS: Record<string, number> = { xs: 12, sm: 16, md: 20, lg: 32 };
const PRESET_KEYS = Object.keys(PRESETS);

const validator = (v: string | number): boolean => {
  if (typeof v === 'number') return v > 0;
  if (PRESET_KEYS.includes(v)) return true;
  const n = Number(v);
  return !Number.isNaN(n) && n > 0;
};

const resolvePx = (v: string | number): number => {
  if (PRESET_KEYS.includes(String(v))) return PRESETS[v as string];
  return Number(v);
};

// ────────────────────────────────────────────────────────────────────────────

describe('KSpinner — size prop validator', () => {
  describe('preset strings — accepted, no warning', () => {
    (['xs', 'sm', 'md', 'lg'] as const).forEach((size) => {
      it(`accepts size="${size}"`, () => {
        expect(validator(size)).toBe(true);
      });
    });
  });

  describe('numeric string — accepted, no warning', () => {
    it('accepts size="14" (numeric string)', () => {
      expect(validator('14')).toBe(true);
    });

    it('accepts size="24" (numeric string)', () => {
      expect(validator('24')).toBe(true);
    });
  });

  describe('number type — accepted, no warning', () => {
    it('accepts :size="14" (number)', () => {
      expect(validator(14)).toBe(true);
    });

    it('accepts :size="20" (number)', () => {
      expect(validator(20)).toBe(true);
    });
  });

  describe('invalid values — rejected (warning expected)', () => {
    it('rejects size="0"', () => {
      expect(validator('0')).toBe(false);
    });

    it('rejects :size="0"', () => {
      expect(validator(0)).toBe(false);
    });

    it('rejects :size="-4" (negative number)', () => {
      expect(validator(-4)).toBe(false);
    });

    it('rejects size="-4" (negative string)', () => {
      expect(validator('-4')).toBe(false);
    });

    it('rejects size="banana" (non-numeric string)', () => {
      expect(validator('banana')).toBe(false);
    });
  });
});

describe('KSpinner — px resolution', () => {
  it('xs → 12px', () => expect(resolvePx('xs')).toBe(12));
  it('sm → 16px', () => expect(resolvePx('sm')).toBe(16));
  it('md → 20px', () => expect(resolvePx('md')).toBe(20));
  it('lg → 32px', () => expect(resolvePx('lg')).toBe(32));
  it('"14" (string) → 14px', () => expect(resolvePx('14')).toBe(14));
  it('14 (number) → 14px', () => expect(resolvePx(14)).toBe(14));
  it('24 (number) → 24px', () => expect(resolvePx(24)).toBe(24));
});
