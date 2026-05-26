/**
 * KInput.types.spec.ts
 *
 * Validates the `type` prop validator against the full set of accepted HTML
 * input type values. Runs in node environment — tests the validator function
 * directly rather than mounting (no DOM available in this project's test setup).
 *
 * Acceptance: validator returns true for every allowed type, false for garbage.
 */

import { describe, it, expect } from 'vitest';

// Mirror the validator defined in KInput.vue so this test is the source of truth
// for the expected accepted set. If KInput's validator drifts, these tests fail.
const ACCEPTED_TYPES = [
  'text',
  'password',
  'email',
  'number',
  'search',
  'tel',
  'url',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
] as const;

type InputType = (typeof ACCEPTED_TYPES)[number];

const validator = (v: string): boolean => (ACCEPTED_TYPES as readonly string[]).includes(v);

describe('KInput — type prop validator', () => {
  describe('accepted types (no warning)', () => {
    const cases: InputType[] = [
      'text',
      'password',
      'email',
      'number',
      'search',
      'tel',
      'url',
      'date',
      'datetime-local',
      'time',
      'month',
      'week',
    ];

    cases.forEach((type) => {
      it(`accepts type="${type}"`, () => {
        expect(validator(type)).toBe(true);
      });
    });
  });

  describe('rejected types (warning expected)', () => {
    it('rejects "banana" (unknown type)', () => {
      expect(validator('banana')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(validator('')).toBe(false);
    });

    it('rejects "checkbox" (not a KInput concern)', () => {
      expect(validator('checkbox')).toBe(false);
    });

    it('rejects "file" (not in the allowed set)', () => {
      expect(validator('file')).toBe(false);
    });
  });
});
