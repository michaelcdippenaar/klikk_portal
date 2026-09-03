import apiClient from './client';

/**
 * Audit → live comment feed.
 *
 * The console polls this so a comment left by someone else shows up without a
 * reload. Deliberately polling rather than websockets — see the backend module
 * apps/audit/comment_feed_views.py for the reasoning.
 */

const FEED = '/audit/comments/feed/';

/**
 * Comments created since `since` (an ISO-8601 string; EXCLUSIVE).
 *
 * Returns { now, server_time, truncated, events: [ { kind, object_id,
 * object_ref, comment: { id, parent_id, author, text, created_at } } ] }.
 *
 * ALWAYS carry `now` forward as the next `since` — it is the SERVER's clock.
 * Using the browser's would drift and either replay or skip events.
 */
export async function getCommentFeed(since) {
  const response = await apiClient.get(FEED, {
    params: since ? { since } : {},
  });
  return response.data;
}
