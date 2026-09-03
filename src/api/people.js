import apiClient from './client';

/**
 * The people directory — who holds which SEAT.
 *
 * `app.cube_people` is a CURATED list, not anything derived: the people who
 * receive work here (the bookkeeper, the auditors) have no console login, and
 * their addresses are entered on purpose rather than inferred. It is the same
 * directory `@mentions` resolve against, which is what keeps one answer to
 * "who is the bookkeeper" instead of two that drift.
 *
 * What a comment stores is the HANDLE — `bookkeeper`, not `anzelle`. Replacing
 * a bookkeeper is then one row in this directory rather than a rewrite of
 * every point ever sent to her. So the console shows `display_name` and works
 * in `handle`, never the other way round.
 */

/**
 * GET the directory.
 *
 * `all: 1` is sent DELIBERATELY, and the caller filters on `active` itself.
 * The endpoint's default is active-only, which would be the smaller and safer
 * fetch — except that a comment already assigned to a seat that has since been
 * stood down would then have no name to render, and would show a bare handle
 * as if it were unknown. Fetching everyone lets a stale assignment be labelled
 * honestly ("Jordyn Wolhuter — no longer active") while the OFFER list stays
 * strictly active. Two different questions, one round trip.
 *
 * → { count, results: [{ id, handle, display_name, email, active, … }] }
 */
export async function getPeople({ includeInactive = true } = {}) {
  const response = await apiClient.get('/xero/data/journals/pivot/people/', {
    params: includeInactive ? { all: 1 } : {},
  });
  return response.data;
}
