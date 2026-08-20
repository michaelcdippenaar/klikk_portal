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
