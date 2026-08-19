/**
 * receipts.bulk.spec.ts — adversarial spec for the bulk endpoints in
 * src/api/receipts.js: bulkUpdateReceipts() batching and getReceiptIds().
 *
 * Mocks ONLY ./client (the axios instance) and asserts the actual HTTP calls:
 * batch boundaries (500 / 501 is the off-by-one most likely to be wrong),
 * per-batch bodies, aggregate summing, unknown-concatenation order,
 * mid-flight failure carrying `err.partial`, and malformed server payloads
 * never producing NaN.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import apiClient from '../client';
import { bulkUpdateReceipts, getReceiptIds, BULK_MAX } from '../receipts';

const client = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const BULK_URL = '/audit/receipts/bulk/';

/** n distinct 64-char pseudo-shas, in a deterministic order. */
function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${String(i).padStart(8, '0')}${'e'.repeat(56)}`);
}

const okBatch = (over: Record<string, unknown> = {}) => ({
  data: { updated: 0, commented: 0, unknown: [], ...over },
});

beforeEach(() => {
  client.get.mockReset();
  client.post.mockReset();
});

// ── bulkUpdateReceipts ───────────────────────────────────────────────────────

describe('bulkUpdateReceipts — empty / non-array input', () => {
  it('empty array resolves {updated:0, commented:0, unknown:[]} and makes ZERO HTTP calls', async () => {
    const res = await bulkUpdateReceipts([], { set_to_process: true });
    expect(res).toEqual({ updated: 0, commented: 0, unknown: [] });
    expect(client.post).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
  });

  it('non-array input (undefined / null) resolves the empty aggregate without hitting the network', async () => {
    // @ts-expect-error — hostile caller
    expect(await bulkUpdateReceipts(undefined, { decision: '' })).toEqual({ updated: 0, commented: 0, unknown: [] });
    // @ts-expect-error — hostile caller
    expect(await bulkUpdateReceipts(null, { decision: '' })).toEqual({ updated: 0, commented: 0, unknown: [] });
    expect(client.post).not.toHaveBeenCalled();
  });
});

describe('bulkUpdateReceipts — batch boundaries (BULK_MAX = 500)', () => {
  it('exports BULK_MAX = 500 (the server-side cap)', () => {
    expect(BULK_MAX).toBe(500);
  });

  it('exactly 500 ids → exactly ONE POST carrying all 500', async () => {
    client.post.mockResolvedValue(okBatch({ updated: 500 }));
    const all = ids(500);
    await bulkUpdateReceipts(all, { set_to_process: true });

    expect(client.post).toHaveBeenCalledTimes(1);
    const body = client.post.mock.calls[0][1];
    expect(body.sha256s).toHaveLength(500);
    expect(body.sha256s).toEqual(all);
  });

  it('501 ids → exactly TWO POSTs of 500 then 1, covering every id exactly once in order', async () => {
    client.post.mockResolvedValue(okBatch());
    const all = ids(501);
    await bulkUpdateReceipts(all, { set_to_process: false });

    expect(client.post).toHaveBeenCalledTimes(2);
    const first = client.post.mock.calls[0][1].sha256s;
    const second = client.post.mock.calls[1][1].sha256s;
    expect(first).toHaveLength(500);
    expect(second).toHaveLength(1);
    // No id dropped, none duplicated, order preserved across the split.
    expect([...first, ...second]).toEqual(all);
    expect(second[0]).toBe(all[500]);
  });

  it('1200 ids → THREE POSTs (500 / 500 / 200)', async () => {
    client.post.mockResolvedValue(okBatch());
    await bulkUpdateReceipts(ids(1200), { decision: 'CAPTURE' });
    expect(client.post).toHaveBeenCalledTimes(3);
    expect(client.post.mock.calls.map((c) => c[1].sha256s.length)).toEqual([500, 500, 200]);
  });
});

describe('bulkUpdateReceipts — aggregation across batches', () => {
  it('sums updated/commented and CONCATENATES unknown in batch order', async () => {
    client.post
      .mockResolvedValueOnce(okBatch({ updated: 498, commented: 0, unknown: ['u1'] }))
      .mockResolvedValueOnce(okBatch({ updated: 499, commented: 1, unknown: ['u2', 'u3'] }))
      .mockResolvedValueOnce(okBatch({ updated: 200, commented: 0, unknown: [] }));

    const res = await bulkUpdateReceipts(ids(1200), { comment: 'x' });
    expect(res.updated).toBe(498 + 499 + 200);
    expect(res.commented).toBe(1);
    expect(res.unknown).toEqual(['u1', 'u2', 'u3']); // batch order, not sorted / merged
  });

  it('spreads the actions into EVERY batch body and sends the batch (not the whole list) as sha256s', async () => {
    client.post.mockResolvedValue(okBatch());
    const actions = { set_to_process: true, decision: 'CAPTURE', note: 'why', comment: 'chase this' };
    const all = ids(501);
    await bulkUpdateReceipts(all, actions);

    expect(client.post).toHaveBeenCalledTimes(2);
    for (const [i, call] of client.post.mock.calls.entries()) {
      const [url, body] = call;
      expect(url).toBe(BULK_URL);
      // Every action key forwarded verbatim on every batch…
      expect(body.set_to_process).toBe(true);
      expect(body.decision).toBe('CAPTURE');
      expect(body.note).toBe('why');
      expect(body.comment).toBe('chase this');
      // …and nothing else beyond sha256s + the actions.
      expect(Object.keys(body).sort()).toEqual(['comment', 'decision', 'note', 'set_to_process', 'sha256s']);
      // sha256s is THIS batch, never the whole list.
      expect(body.sha256s.length).toBe(i === 0 ? 500 : 1);
      expect(body.sha256s.length).toBeLessThanOrEqual(BULK_MAX);
    }
  });

  it('a decision of empty-string (Clear decision) survives the spread — sent as "" on the wire, not dropped', async () => {
    client.post.mockResolvedValue(okBatch());
    await bulkUpdateReceipts(ids(2), { decision: '' });
    const body = client.post.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(body, 'decision')).toBe(true);
    expect(body.decision).toBe('');
  });
});

describe('bulkUpdateReceipts — mid-flight failure', () => {
  it('batch 2 of 3 rejecting throws, with err.partial carrying batch-1 counts and batchesDone = COMPLETED count (1), batchesTotal 3', async () => {
    const boom = new Error('500 from server');
    client.post
      .mockResolvedValueOnce(okBatch({ updated: 500, commented: 2, unknown: ['gone1'] }))
      .mockRejectedValueOnce(boom);

    let caught: (Error & { partial?: Record<string, unknown> }) | null = null;
    try {
      await bulkUpdateReceipts(ids(1200), { set_to_process: true });
    } catch (e) {
      caught = e as Error & { partial?: Record<string, unknown> };
    }

    expect(caught).toBe(boom); // the original error propagates, not a rewrap
    expect(caught!.partial).toEqual({
      updated: 500,
      commented: 2,
      unknown: ['gone1'],
      batchesDone: 1, // one batch COMPLETED — not "2" (the index being attempted)
      batchesTotal: 3,
    });
    // The failing batch aborts the run: batch 3 is never attempted.
    expect(client.post).toHaveBeenCalledTimes(2);
  });

  it('the FIRST batch rejecting reports batchesDone 0 and zero counts', async () => {
    client.post.mockRejectedValue(new Error('nope'));
    let caught: (Error & { partial?: Record<string, unknown> }) | null = null;
    try {
      await bulkUpdateReceipts(ids(501), { decision: 'PERSONAL' });
    } catch (e) {
      caught = e as Error & { partial?: Record<string, unknown> };
    }
    expect(caught!.partial).toEqual({
      updated: 0,
      commented: 0,
      unknown: [],
      batchesDone: 0,
      batchesTotal: 2,
    });
    expect(client.post).toHaveBeenCalledTimes(1);
  });
});

describe('bulkUpdateReceipts — malformed server payloads never produce NaN', () => {
  it.each([
    ['empty object {}', { data: {} }],
    ['updated: null', { data: { updated: null, commented: null, unknown: null } }],
    ['unknown: "nope" (non-array)', { data: { updated: 2, commented: 0, unknown: 'nope' } }],
    ['updated: "abc" (non-numeric string)', { data: { updated: 'abc', commented: 'xyz', unknown: [] } }],
    ['200 with no body at all', {}],
    ['response is undefined', undefined],
  ])('%s → numeric aggregate, array unknown, no throw', async (_label, response) => {
    client.post.mockResolvedValue(response);
    const res = await bulkUpdateReceipts(ids(3), { set_to_process: true });
    expect(Number.isFinite(res.updated)).toBe(true);
    expect(Number.isFinite(res.commented)).toBe(true);
    expect(Number.isNaN(res.updated)).toBe(false);
    expect(Number.isNaN(res.commented)).toBe(false);
    expect(Array.isArray(res.unknown)).toBe(true);
  });

  it('a malformed batch mixed with a good batch still sums to a number', async () => {
    client.post
      .mockResolvedValueOnce({ data: { updated: null } })
      .mockResolvedValueOnce(okBatch({ updated: 1, commented: 1, unknown: ['u'] }));
    const res = await bulkUpdateReceipts(ids(501), { comment: 'x' });
    expect(res.updated).toBe(1);
    expect(res.commented).toBe(1);
    expect(res.unknown).toEqual(['u']);
  });
});

// ── getReceiptIds ────────────────────────────────────────────────────────────

describe('getReceiptIds', () => {
  it('sends ids_only: 1 PLUS every passed filter param, to the list endpoint', async () => {
    client.get.mockResolvedValue({ data: { count: 2, sha256s: ['a', 'b'], truncated: false } });
    const res = await getReceiptIds({ status: 'PENDING', fy: 'FY26', q: 'makro', decision: 'NONE' });

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('/audit/receipts/', {
      params: { status: 'PENDING', fy: 'FY26', q: 'makro', decision: 'NONE', ids_only: 1 },
    });
    expect(res).toEqual({ count: 2, sha256s: ['a', 'b'], truncated: false });
  });

  it('does NOT mutate the caller\'s params object (frozen input, no ids_only leak)', async () => {
    client.get.mockResolvedValue({ data: { count: 0, sha256s: [], truncated: false } });
    const params = Object.freeze({ status: 'PENDING', date_from: '2026-01-01' });
    // Mutating a frozen object throws in strict-mode ESM, so this call itself
    // is the assertion that the implementation copies rather than mutates.
    await getReceiptIds(params);
    expect(params).toEqual({ status: 'PENDING', date_from: '2026-01-01' });
    expect('ids_only' in params).toBe(false);
  });

  it('with no params still sends ids_only: 1 alone', async () => {
    client.get.mockResolvedValue({ data: { count: 0, sha256s: [], truncated: false } });
    await getReceiptIds();
    expect(client.get).toHaveBeenCalledWith('/audit/receipts/', { params: { ids_only: 1 } });
  });
});
