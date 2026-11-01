# Adult Stories v8.4 — auth_unavailable diagnostic patch

This patch changes ONLY `server/core.cjs`; Productdrop/Mongolsub are not affected.

## What was proven

`POST /api/adult-admin` returns `503 {"ok":false,"error":"auth_unavailable"}`.
In the original `admin()` function, that exact error is emitted only when the Supabase Auth fetch fails OR a required configuration lookup throws inside the same catch. The R2 upload code has not been reached.

## Changes

- Missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is now returned as `service_not_configured` instead of being concealed as `auth_unavailable`.
- Trims accidental whitespace and a trailing slash from `SUPABASE_URL`, and surrounding whitespace from the service role key.
- Validates the Supabase URL.
- For actual fetch exceptions, writes `adult_admin_auth_fetch_failed` plus safe error name/code in Netlify Function logs. No secrets or bearer tokens are logged.
- No bypass of authentication or authorization. All original admin permission checks remain.

## Install

Copy `server/core.cjs` into the Adult Stories repository's `server/core.cjs` (same root level as `netlify.toml`) and redeploy production on Netlify. Do not upload `core.cjs` into `public`.

Retry one picture upload; inspect Chrome Network Response and Netlify Functions -> adult-admin log.

- `service_not_configured`: variable is missing, empty or invalid in deployed Function scope. Check names, Production context, Functions scope, and redeploy.
- `auth_unavailable` + `ENOTFOUND`: wrong Supabase hostname or DNS failure.
- `auth_unavailable` + `ECONNRESET`, `ETIMEDOUT` or `UND_ERR_CONNECT_TIMEOUT`: outbound network problem or remote service inaccessible.
- `auth_unavailable` + `TypeError` / `UNKNOWN`: further diagnosis needed; send only the sanitized log line.
- `unauthorized` (401): network is now working but user token is invalid/expired; sign out and sign in.
- `admin_required` (403): Supabase user is not in `admin_users`.
- `database_unavailable`: Supabase Rest API or database permission/configuration problem.

NEVER paste secrets, Authorization headers, tokens or `.env` into chat or logs.
