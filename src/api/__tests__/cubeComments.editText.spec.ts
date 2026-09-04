/**
 * cubeComments.editText.spec — what goes ON THE WIRE when a comment is
 * rewritten, and what does not.
 *
 * The page spec mounts the register and asserts what the reader sees. It
 * cannot see the request body, because it mocks this module. So the body is
 * pinned HERE, at the only place it exists.
 *
 * Why the body matters more than the call: the register is an audit trail.
 * `app.cube_comments` is upserted ON CONFLICT (subject_type, subject_key,
 * author_key) with `author_key` stamped from the credential — so a write that
 * carries an anchor or an author does not amend somebody's comment, it forks
 * it under the caller's name. That is why this endpoint refuses those fields
 * outright, and why "the call happened" is not the assertion. The assertion is
 * that the body carries the TEXT AND NOTHING ELSE.
 *
 * The fixture is a production-shaped row — full anchor, an agent author, a
 * 1.4 MB-register `filters` blob — precisely so that a future refactor which
 * "helpfully" spreads the row into the payload fails here rather than in the
 * register.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import apiClient from '../client';
import { setCubeCommentText, getCubeCommentTextHistory } from '../cubeComments';

const client = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

/** A live-shaped row. Nothing on it but `comment` may reach the wire. */
const ROW = {
  id: 41,
  subject_type: 'cube_cell',
  subject_key: 'account=6100 Repairs|month=2026-08',
  subject_label: 'Repairs & maintenance · Aug 2026',
  comment: 'Check this is not capitalised.',
  author: 'claude:year-end-audit',
  author_key: 'claude:year-end-audit',
  cell_key: 'B14',
  row_dims: ['account'],
  row_path: ['6100 Repairs'],
  col_dims: ['month'],
  col_path: '2026-08',
  measure: 'amount',
  cell_value: '21600.00',
  filters: '{"fy": "2026", "entity": "Klikk"}',
  status: 'open',
};

beforeEach(() => {
  client.post.mockReset();
  client.get.mockReset();
  client.post.mockResolvedValue({ data: { ...ROW, comment: 'Rewritten.', edited: true } });
  client.get.mockResolvedValue({ data: { history: [] } });
});

describe('setCubeCommentText — the body carries the text and nothing else', () => {
  it('POSTs {comment} to the by-id text door, and no other key', async () => {
    await setCubeCommentText(41, 'Rewritten.');

    expect(client.post).toHaveBeenCalledTimes(1);
    const [url, body] = client.post.mock.calls[0];
    expect(url).toBe('/xero/data/journals/pivot/comments/41/text/');
    // toEqual, not toMatchObject: an EXTRA key is the failure this exists for.
    expect(body).toEqual({ comment: 'Rewritten.' });
    expect(Object.keys(body as object)).toEqual(['comment']);
  });

  it('carries no anchor field, however the caller was holding the row', async () => {
    // The realistic mistake is not inventing a field — it is spreading the row
    // the caller already has. This asserts the shape survives that instinct.
    await setCubeCommentText(ROW.id, 'Rewritten.');
    const body = client.post.mock.calls[0][1] as Record<string, unknown>;
    for (const anchor of [
      'cell_key', 'subject_type', 'subject_key', 'subject_label',
      'row_dims', 'row_path', 'col_dims', 'col_path',
      'measure', 'cell_value', 'filters', 'context',
    ]) {
      expect(body).not.toHaveProperty(anchor);
    }
  });

  it('carries no author field — the writer is the server\'s to decide', async () => {
    await setCubeCommentText(ROW.id, 'Rewritten.');
    const body = client.post.mock.calls[0][1] as Record<string, unknown>;
    for (const who of ['author', 'author_key', 'edited_by', 'user', 'username']) {
      expect(body).not.toHaveProperty(who);
    }
  });

  it('sends the text UNTOUCHED — no client-side trim, no normalisation', async () => {
    // Whether trailing whitespace is a change is the SERVER's call (it answers
    // `edited: false` when it is not). A client that trimmed first would make
    // that call itself, and would eventually disagree with the trail.
    const padded = '  Rewritten, with air.  \n';
    await setCubeCommentText(41, padded);
    expect((client.post.mock.calls[0][1] as { comment: string }).comment).toBe(padded);
  });

  it('sends a very long comment whole — no truncation on the way out', async () => {
    const long = 'x'.repeat(20_000);
    await setCubeCommentText(41, long);
    const sent = (client.post.mock.calls[0][1] as { comment: string }).comment;
    expect(sent).toHaveLength(20_000);
    expect(sent).toBe(long);
  });

  it('percent-encodes the id into the path rather than concatenating it raw', async () => {
    await setCubeCommentText('41/../42' as unknown as number, 'Rewritten.');
    expect(client.post.mock.calls[0][0])
      .toBe('/xero/data/journals/pivot/comments/41%2F..%2F42/text/');
  });

  it('returns the server row verbatim, `edited` included', async () => {
    const out = await setCubeCommentText(41, 'Rewritten.');
    expect(out).toMatchObject({ id: 41, comment: 'Rewritten.', edited: true });
    // And it does not invent one when the server says no-op.
    client.post.mockResolvedValue({ data: { ...ROW, edited: false } });
    expect(await setCubeCommentText(41, ROW.comment)).toMatchObject({ edited: false });
  });

  it('lets the server\'s refusal through unswallowed', async () => {
    const refusal = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: { error: 'cell_key cannot be edited — it is part of what identifies the comment.' },
      },
    });
    client.post.mockRejectedValue(refusal);
    await expect(setCubeCommentText(41, 'Rewritten.')).rejects.toBe(refusal);
  });
});

describe('getCubeCommentTextHistory — same path, GET, no body', () => {
  it('GETs the by-id text door and passes no params', async () => {
    await getCubeCommentTextHistory(41);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0])
      .toEqual(['/xero/data/journals/pivot/comments/41/text/']);
    // The trail is read on demand only; it must never be a POST.
    expect(client.post).not.toHaveBeenCalled();
  });

  it('encodes the id', async () => {
    await getCubeCommentTextHistory('a b' as unknown as number);
    expect(client.get.mock.calls[0][0])
      .toBe('/xero/data/journals/pivot/comments/a%20b/text/');
  });
});
