/**
 * Every API prefix the frontend calls.
 *
 * `vite.config.ts` proxies each of these to the backend during `vite dev` and
 * `vite preview`, so the browser only ever talks to one origin — and
 * `prefixes.test.ts` fails when a call is added under a prefix that is not here.
 *
 * The failure mode this prevents is quiet: a prefix missing from the table makes
 * the dev server answer the request itself (the SPA fallback only covers
 * `Accept: text/html`, so a `fetch` is never diverted to index.html) and the call
 * 404s, while production — where the backend serves the SPA — keeps working. That
 * is how `/admin` (the database restore endpoint) and `/playground` were both
 * broken in development.
 */
export const API_PREFIXES: readonly string[] = ["/login", "/register", "/logout", "/status", "/users", "/data", "/admin", "/playground"]
