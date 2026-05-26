/**
 * KTable.emptyAnnounce.spec.ts
 *
 * F8 — Empty-state region accessibility announcement.
 *
 * Verifies the structural contract of the KTable template:
 *   - The empty-state wrapper carries role="status" and aria-live="polite"
 *     so screen readers announce "No data" when filters yield zero results.
 *   - The id / regionId is auto-generated when no :id prop is supplied.
 *   - A consumer-supplied :id is used verbatim (and can be read back via
 *     defineExpose's regionId).
 *
 * Strategy: parse the SFC <template> as a string — avoids mounting the
 * component in a node environment that lacks a DOM renderer, and is consistent
 * with the project's existing test patterns (KTable.sort.spec.ts, etc.).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const KTABLE_PATH = resolve(__dirname, '../KTable.vue');
const source = readFileSync(KTABLE_PATH, 'utf-8');

describe('KTable — F8 empty-state announcement (structural)', () => {
  it('empty-state wrapper has role="status"', () => {
    // The empty-state <div> must carry role="status"
    expect(source).toContain('role="status"');
  });

  it('empty-state wrapper has aria-live="polite"', () => {
    // Must be present alongside role="status" for maximum compatibility
    expect(source).toContain('aria-live="polite"');
  });

  it('role="status" and aria-live="polite" appear on the same empty-state element', () => {
    // Locate the empty-state v-else-if block and verify both attributes are
    // within the same <div> — not on unrelated elements.
    const emptyBlockStart = source.indexOf('v-else-if="!loading && !error && !data.length"');
    expect(emptyBlockStart).toBeGreaterThan(-1);

    // Slice a reasonable window around the empty-state opening tag
    const window = source.slice(emptyBlockStart - 200, emptyBlockStart + 200);
    expect(window).toContain('role="status"');
    expect(window).toContain('aria-live="polite"');
  });

  it('regionId is derived from the :id prop or falls back to an auto-generated kt- id', () => {
    // Verify both branches of the computed are present in the script
    expect(source).toContain('props.id ??');
    expect(source).toContain('kt-');
    expect(source).toContain('Math.random()');
  });

  it('scroll container receives :id="regionId" binding', () => {
    expect(source).toContain(':id="regionId"');
  });

  it('regionId is exposed via defineExpose for consumer aria-controls use', () => {
    expect(source).toContain('defineExpose');
    expect(source).toContain('regionId');
  });
});
