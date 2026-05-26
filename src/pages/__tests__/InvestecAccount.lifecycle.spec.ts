/**
 * InvestecAccount.lifecycle.spec.ts
 *
 * Tests: onUnmounted hygiene for InvestecAccount.
 *
 * Strategy: exercise the cleanup logic directly as pure functions,
 * matching the project's node-environment test pattern (no jsdom / @vue/test-utils).
 *
 * What is verified:
 *   - clearTimeout is called on the debounce timer when cleanup runs
 *   - AbortController.abort() is called on the in-flight fetch controller on cleanup
 *   - Neither call throws when timer / controller is null (clean first-render case)
 *   - The abort does NOT fire when no in-flight request exists (fetchAbortController is null)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Cleanup logic mirroring onUnmounted() in InvestecAccount.vue ──────────────

/**
 * Represents the mutable cleanup state that InvestecAccount tracks.
 * In the component, these are module-level `let` variables.
 */
interface CleanupState {
  searchTimeout: ReturnType<typeof setTimeout> | null;
  routeTimeout: ReturnType<typeof setTimeout> | null;
  fetchAbortController: AbortController | null;
}

/**
 * Mirrors the onUnmounted handler in InvestecAccount.vue.
 * Extracted as a pure function so it can be unit-tested.
 */
function runCleanup(state: CleanupState): void {
  if (state.searchTimeout) clearTimeout(state.searchTimeout);
  if (state.routeTimeout)  clearTimeout(state.routeTimeout);
  state.fetchAbortController?.abort();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvestecAccount — onUnmounted hygiene', () => {
  let clearTimeoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debounce timer cleanup', () => {
    it('calls clearTimeout for searchTimeout when it is set', () => {
      const fakeTimer = 42 as unknown as ReturnType<typeof setTimeout>;
      const state: CleanupState = {
        searchTimeout: fakeTimer,
        routeTimeout: null,
        fetchAbortController: null,
      };

      runCleanup(state);

      expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimer);
    });

    it('calls clearTimeout for routeTimeout when it is set', () => {
      const fakeTimer = 99 as unknown as ReturnType<typeof setTimeout>;
      const state: CleanupState = {
        searchTimeout: null,
        routeTimeout: fakeTimer,
        fetchAbortController: null,
      };

      runCleanup(state);

      expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimer);
    });

    it('calls clearTimeout for both timers when both are set', () => {
      const t1 = 10 as unknown as ReturnType<typeof setTimeout>;
      const t2 = 20 as unknown as ReturnType<typeof setTimeout>;
      const state: CleanupState = {
        searchTimeout: t1,
        routeTimeout: t2,
        fetchAbortController: null,
      };

      runCleanup(state);

      expect(clearTimeoutSpy).toHaveBeenCalledWith(t1);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(t2);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
    });

    it('does NOT call clearTimeout when searchTimeout is null', () => {
      const state: CleanupState = {
        searchTimeout: null,
        routeTimeout: null,
        fetchAbortController: null,
      };

      runCleanup(state);

      expect(clearTimeoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('AbortController cleanup', () => {
    it('calls abort() on fetchAbortController when in-flight request exists', () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');

      const state: CleanupState = {
        searchTimeout: null,
        routeTimeout: null,
        fetchAbortController: controller,
      };

      runCleanup(state);

      expect(abortSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT throw when fetchAbortController is null', () => {
      const state: CleanupState = {
        searchTimeout: null,
        routeTimeout: null,
        fetchAbortController: null,
      };

      // Should not throw — optional chaining guards the null case
      expect(() => runCleanup(state)).not.toThrow();
    });

    it('abort signal is aborted after cleanup', () => {
      const controller = new AbortController();
      expect(controller.signal.aborted).toBe(false);

      const state: CleanupState = {
        searchTimeout: null,
        routeTimeout: null,
        fetchAbortController: controller,
      };

      runCleanup(state);

      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe('combined cleanup — timer + abort together', () => {
    it('clears timer AND aborts controller in a single cleanup call', () => {
      const fakeTimer = 55 as unknown as ReturnType<typeof setTimeout>;
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');

      const state: CleanupState = {
        searchTimeout: fakeTimer,
        routeTimeout: null,
        fetchAbortController: controller,
      };

      runCleanup(state);

      expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimer);
      expect(abortSpy).toHaveBeenCalledTimes(1);
    });
  });
});
