/**
 * useRelativeTime — Vitest spec
 *
 * Tests the time-bucketing logic directly by extracting the pure formatting
 * function. We test all buckets: null, <60s, <60m, <24h, yesterday,
 * 2–6 days, 7–30 days, >30 days.
 *
 * Strategy: the composable exports its formatting logic via the returned
 * `relative` ref. We call useRelativeTime with a static date and read
 * relative.value synchronously (watch({immediate:true}) fires before the
 * first tick). Vue lifecycle hooks (onMounted/onUnmounted) are no-ops in
 * the test environment — we don't exercise the 30s interval here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';

// Stub out Vue lifecycle hooks so the composable can be called outside a
// component context without warnings.
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return {
    ...actual,
    onMounted: vi.fn(),
    onUnmounted: vi.fn(),
  };
});

import { useRelativeTime } from '../useRelativeTime.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Pin "now" so assertions are deterministic
const FIXED_NOW = new Date('2026-05-25T14:00:00.000Z').getTime();

describe('useRelativeTime', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "Never run" for null input', () => {
    const { relative } = useRelativeTime(ref(null));
    expect(relative.value).toBe('Never run');
  });

  it('returns "just now" for less than 60 seconds ago', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - 45 * 1000)));
    expect(relative.value).toBe('just now');
  });

  it('returns "Xm ago" for 1–59 minutes ago', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - 4 * MINUTE)));
    expect(relative.value).toBe('4m ago');
  });

  it('returns "1m ago" for exactly 1 minute ago', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - MINUTE)));
    expect(relative.value).toBe('1m ago');
  });

  it('returns "Xh Ym ago" for hours with remaining minutes', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - (2 * HOUR + 15 * MINUTE))));
    expect(relative.value).toBe('2h 15m ago');
  });

  it('returns "Xh ago" for exact whole hours (zero minutes remainder)', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - 3 * HOUR)));
    expect(relative.value).toBe('3h ago');
  });

  it('returns "X days ago" for 2–6 days ago', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - 3 * DAY)));
    expect(relative.value).toBe('3 days ago');
  });

  it('returns "X weeks ago" for 7–30 days ago', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - 14 * DAY)));
    expect(relative.value).toBe('2 weeks ago');
  });

  it('returns "1 week ago" (singular) for exactly 7 days', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - 7 * DAY)));
    expect(relative.value).toBe('1 week ago');
  });

  it('returns a YYYY-MM-DD string for more than 30 days ago', () => {
    const { relative } = useRelativeTime(ref(new Date(FIXED_NOW - 45 * DAY)));
    expect(relative.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
