import apiClient from './client';

/**
 * Cell comments MC and the agents pin to figures in Excel.
 *
 * Backed by the same endpoints the Excel add-in uses, so the console and the
 * add-in are two views of ONE register rather than two stores that drift.
 *
 * A comment is anchored to a figure by its COORDINATES -- {dimension: value} --
 * not by a cell address and not by which axis a value sat on. That is what lets
 * this page show what a comment is about without the workbook it was written in.
 */

/** GET the queue. status: open | actioned | dismissed | all. */
export async function getCubeComments(params = {}) {
  const response = await apiClient.get('/xero/data/journals/pivot/comments/', { params });
  return response.data;
}

/**
 * The whole register, every kind of subject — cube cells, bank transactions,
 * and whatever is added next. One queue rather than one page per feature.
 */
export async function getComments(params = {}) {
  const response = await apiClient.get('/xero/data/comments/', { params });
  return response.data;
}

/**
 * Record a verdict on a non-cube subject.
 *
 * NOT REACHABLE FROM THE UI, and must not be wired back to one.
 *
 * The premise below is wrong in a way that matters. /xero/data/comments/ does
 * upsert — but on (subject_type, subject_key, AUTHOR_KEY), and `author_key` is
 * stamped by the server from the credential, never read from the `author`
 * field this function sends. Re-posting a comment written by anyone else
 * therefore does not amend it: it INSERTS A SECOND ROW carrying their text
 * under the requester's name. The same endpoint 400s outright when
 * subject_type is 'cube_cell', which is most of the register.
 *
 * Kept, unused, rather than deleted: it is the record of what the verdict
 * write actually did, and the next person to reach for "just POST the
 * decision" needs to find this note rather than rediscover it in the data. The
 * verdict vocabulary is an open design decision MC has reserved; when it is
 * settled the write will want its own by-id endpoint, not this.
 *
 * The verdict FILTER is unaffected and still live — `decision` is real stored
 * data written by the add-in and the MCP, and reading it was never the defect.
 */
export async function setCommentDecision(comment, decision) {
  const response = await apiClient.post('/xero/data/comments/', {
    subject_type: comment.subject_type,
    subject_key: comment.subject_key,
    subject_label: comment.subject_label,
    comment: comment.comment,
    author: comment.author,
    tags: comment.tags,
    value: comment.cell_value,
    context: normaliseFilters(comment.filters),
    status: comment.status,
    decision,
  });
  return response.data;
}

export const DECISIONS = [
  { value: '', label: 'Undecided' },
  { value: 'business_expense', label: 'Business expense' },
  { value: 'personal', label: 'Personal' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'needs_info', label: 'Needs info' },
  { value: 'no_action', label: 'No action' },
];

/** Mark one actioned or dismissed. Does not touch its text or its anchor. */
export async function setCubeCommentStatus(id, status) {
  const response = await apiClient.post(
    `/xero/data/journals/pivot/comments/${id}/status/`,
    { status }
  );
  return response.data;
}

/**
 * The journal lines that add up to a commented figure.
 *
 * Resolved live from the anchor rather than from a stored list of ids: the
 * lines behind a figure change when Xero is re-synced, so a frozen list would
 * go stale while still looking authoritative. A total that no longer matches
 * the commented value is therefore meaningful, and this page says so.
 */
export async function drillCubeComment(comment, limit = 500) {
  const coords = commentCoordinates(comment);
  const params = {
    coords: JSON.stringify(coords),
    measure: comment.measure || 'amount',
    limit,
    ...normaliseFilters(comment.filters),
  };
  const response = await apiClient.get('/xero/data/journals/pivot/drill/', { params });
  return response.data;
}

/**
 * Flatten a comment's stored anchor into {dimension: value}.
 *
 * Row and column paths are kept separately for historical reasons; the identity
 * is the union of the two. Presenting them separately would invite treating two
 * spellings of one cell as two different figures.
 */
export function commentCoordinates(comment) {
  const coords = {};
  (comment.row_dims || []).forEach((dim, i) => {
    coords[dim] = (comment.row_path || [])[i];
  });
  const colPath = comment.col_path && comment.col_path !== 'Total'
    ? String(comment.col_path).split(' | ')
    : [];
  (comment.col_dims || []).forEach((dim, i) => {
    if (colPath[i] !== undefined) coords[dim] = colPath[i];
  });
  return coords;
}

/** The API hands `filters` back as a JSON string; every caller needs an object. */
export function normaliseFilters(filters) {
  if (!filters) return {};
  if (typeof filters === 'object') return filters;
  try {
    return JSON.parse(filters);
  } catch {
    return {};
  }
}

// ── The auditor-reachable view of the same register ─────────────────────────
//
// Auditors are gated to read-only /audit/ endpoints; everything under
// /xero/data/ 403s for them, including the list above. /audit/cube-comments/
// serves the SAME rows with the SAME filters (plus `reply_count`), so the page
// has ONE load path rather than a branch that only one role ever exercises —
// a branch nobody with a standard account can see is a branch that rots.

const AUDIT_BASE = '/audit/cube-comments/';

/**
 * The register, read through the audit gate.
 * Same params as getComments (status | subject_type | decision | limit …);
 * rows carry `reply_count` on top of the shared shape.
 */
export async function getAuditCubeComments(params = {}) {
  const response = await apiClient.get(AUDIT_BASE, { params });
  return response.data;
}

/**
 * One comment's replies, oldest first.
 * → { comment_id, replies: [{ id, parent_id, author, text, created_at }] }
 */
export async function getCubeCommentReplies(id) {
  const response = await apiClient.get(`${AUDIT_BASE}${encodeURIComponent(id)}/replies/`);
  return response.data;
}

/**
 * Post a reply, optionally under another reply.
 *
 * `parent_id` is OMITTED entirely (never sent as null) for a top-level reply —
 * the contract distinguishes absent from null. `author` is stamped server-side
 * and is never sent from here; that is what makes the thread an audit trail.
 */
export async function postCubeCommentReply(id, text, { parentId = null } = {}) {
  const body = parentId == null ? { text } : { text, parent_id: parentId };
  const response = await apiClient.post(
    `${AUDIT_BASE}${encodeURIComponent(id)}/replies/`,
    body
  );
  return response.data;
}
