# Plan 002: Add tests for the auth middleware and the file-serving routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca98cb9..HEAD -- src/middleware.ts src/lib/security.ts src/app/api`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (must land before plan 003)
- **Category**: tests
- **Planned at**: commit `ca98cb9`, 2026-11-13

## Why this matters

The security-critical code paths that sit in front of all data — the HTTP Basic Auth middleware, the attachment server, the backup download route and the health route — have **no tests**. `tests/security.test.ts` only covers the pure helpers they call. A regression (for example a changed matcher, a swapped comparison, a broken path check) would ship unnoticed. This plan pins the current behavior so plan 003 can change the rate-limit key safely.

## Current state

Files under test (do not modify them):

- `src/middleware.ts` — Basic Auth. Reads `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` from `process.env` on every call; when either is empty, returns `NextResponse.next()`. `/api/health` is always open. Failed attempts (a credentials header was sent and was wrong) count in the shared limiter `auth-failures` (max 10 per 10 minutes, key from `clientKey(req.headers)`); once more than 10 failures are recorded the response is `429` with `Retry-After`, **before** credentials are checked. Missing header → `401` with `WWW-Authenticate: Basic realm="NestFund", charset="UTF-8"` and does not count as a failure. Success calls `failures.reset(who)`.
- `src/lib/security.ts` — `limiter(name, max, windowMs)` keeps limiters in a global map: `globalThis.__nestfundLimiters` (a `Map<string, RateLimiter>`), created with `??=` when the module loads. `clientKey(headers)` returns the first of `cf-connecting-ip`, first entry of `x-forwarded-for`, `x-real-ip`, else `'local'`.
- `src/app/api/attachments/[name]/route.ts` — `GET(_req, { params: Promise<{ name }> })`. Accepts only names matching `/^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,80}$/`; reads from `UPLOADS_DIR`; `Content-Type` comes from the extension (`.png` → `image/png`, unknown → `application/octet-stream` served with `attachment` disposition); always sends `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. Anything else → `404 Not found`.
- `src/app/api/backup/file/route.ts` — `GET(req: NextRequest)`; rate limited with limiter name `backup-file`, max 30 per 60 s; reads `?name=`; `backupJsonPath(name)` (in `src/lib/backup.ts`) only accepts names matching `/^nestfund-[A-Za-z0-9._-]+\.(db|json)$/` **ending in `.json`** and existing in `BACKUP_DIR` (`<DATA_DIR>/backups`); returns the JSON as an attachment, otherwise `404`.
- `src/app/api/health/route.ts` — `GET()` runs `SELECT 1` and returns `{ status: 'ok', version }`.

Conventions:
- Tests live in `tests/*.test.ts` (Vitest, `environment: 'node'`, alias `@` → `src`, `server-only` stubbed). Style: `describe`/`it`, no shared helpers file, small local helper functions at the top. Model after `tests/security.test.ts` (pure helpers) and `tests/trading212-sync.test.ts` (tmp `DATA_DIR` set **before** dynamic `await import(...)`, cleanup in `afterAll`).
- `process.env.DATA_DIR` is read when `src/lib/db.ts` is first imported, so set it before any import of code that touches the database.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| One file | `npx vitest run tests/middleware.test.ts` | all pass |
| All tests | `npm test` | all pass |

## Scope

**In scope**:
- `tests/middleware.test.ts` (create)
- `tests/routes.test.ts` (create)

**Out of scope** (do NOT touch):
- Every file under `src/`. If a test cannot be written without changing source, that is a STOP condition.
- Changing how `clientKey` identifies clients (plan 003 does that).

## Git workflow

- Branch: `advisor/002-middleware-route-tests`
- One commit, short imperative message (e.g. `Add tests for auth middleware and file routes`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Middleware tests

Create `tests/middleware.test.ts`. Imports: `import { NextRequest } from 'next/server'` and `import { middleware } from '@/middleware'`. Helpers:

```ts
const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
const req = (headers: Record<string, string> = {}, path = '/') => new NextRequest(`http://localhost${path}`, { headers });
const passed = (res: Response) => res.headers.get('x-middleware-next') === '1';
```

`beforeEach`: set `process.env.BASIC_AUTH_USER = 'owner'` and `process.env.BASIC_AUTH_PASSWORD = 'correct-horse'`, and clear the limiter store: `(globalThis as { __nestfundLimiters?: Map<string, unknown> }).__nestfundLimiters?.clear()`. `afterEach`: delete both env vars.

Cases (each an `it`):
1. Auth disabled (env vars unset or only one set) → request passes.
2. `/api/health` passes even with auth enabled and no header.
3. No `Authorization` header → 401, `WWW-Authenticate` header starts with `Basic realm="NestFund"`.
4. Wrong password → 401. Wrong username → 401. Malformed header (`'Basic !!!notbase64'`) → 401 and does not throw.
5. Correct credentials → passes.
6. Missing-header requests do **not** count as failures: send 15 requests without a header, then one with correct credentials → passes.
7. Lockout: with header `cf-connecting-ip: 9.9.9.9`, send 10 wrong-password requests (each 401), the 11th wrong request is `429` and has a numeric `Retry-After`; a request with the **correct** password from the same IP is also `429` (the block is checked first).
8. A successful login resets the counter: 9 wrong attempts, 1 correct (passes), then 9 more wrong attempts are all still `401`.
9. Documenting current behavior: while `9.9.9.9` is blocked, a request with `cf-connecting-ip: 8.8.8.8` and correct credentials passes. Put a comment above this test: `// Current behavior: clients are told apart by proxy headers. Plan 003 changes this.`

**Verify**: `npx vitest run tests/middleware.test.ts` → 9+ tests pass.

### Step 2: Route tests

Create `tests/routes.test.ts`. Top of file, before any import of app code:

```ts
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-routes-'));
process.env.DATA_DIR = dir;
```

Then in `beforeAll`: dynamic-import `@/lib/db` (call `db.getDb()` once to create folders), `@/app/api/attachments/[name]/route`, `@/app/api/backup/file/route`, `@/app/api/health/route`. `afterAll`: close the db like `tests/trading212-sync.test.ts` does (`(globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close()`) and `fs.rmSync(dir, { recursive: true, force: true })`. `beforeEach`: clear `globalThis.__nestfundLimiters` as in Step 1.

Attachments (`GET(new Request('http://x'), { params: Promise.resolve({ name }) })`), with a file `<36-char uuid>-receipt.png` written into `db.UPLOADS_DIR`:
1. Valid name → 200, `Content-Type: image/png`, `X-Content-Type-Options: nosniff`, CSP header contains `sandbox`, body bytes equal the file.
2. A valid-shaped name with extension `.bin` → `Content-Type: application/octet-stream` and `Content-Disposition` starts with `attachment`.
3. Rejected with 404: `'../../etc/passwd'`, `'receipt.png'` (no uuid), a uuid-prefixed name containing `/`, `'..%2F..%2Fx'`, a name over 80 chars after the uuid, and a valid-shaped name whose file does not exist.

Backup file (use `new NextRequest('http://x/api/backup/file?name=...')`), with `nestfund-backup-test.json` and `nestfund-backup-test.db` written into `db.BACKUP_DIR` (create the folder with `fs.mkdirSync(..., { recursive: true })`):
4. The `.json` name → 200, `Content-Type` starts with `application/json`, `Content-Disposition` starts with `attachment`, `Cache-Control: no-store`.
5. The `.db` name → 404 (database copies are never downloadable).
6. `../nestfund.db`, `nestfund-../x.json`, empty name, missing `name` → 404.
7. Rate limit: the 31st request within a minute from the same client → 429 (send 31 valid requests; the first 30 are 200).

Health:
8. `GET()` → 200 and JSON `status: 'ok'`.

**Verify**: `npx vitest run tests/routes.test.ts` → all pass.

### Step 3: Full suite

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass (previous 288 tests plus the new ones).

## Test plan

This plan *is* the test plan: ~9 middleware tests and ~8+ route tests as listed above. They assert observable HTTP behavior only (status, headers, body), not internals.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0, with both new files present and passing
- [ ] `git status` shows only the two new test files
- [ ] No file under `src/` was modified
- [ ] `plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match the source (drift).
- `new NextRequest(...)` or `middleware()` cannot run under Vitest's Node environment after one reasonable attempt — report the error rather than editing source or config.
- `x-middleware-next` is not present on `NextResponse.next()` in this Next version (then use another reliable "passed through" check, and tell the reviewer which).
- Any test reveals real unexpected behavior (for example a traversal name returning 200) — report it as a security finding instead of "fixing" the test.

## Maintenance notes

- Test 9 in `middleware.test.ts` documents behavior that plan 003 intentionally changes; plan 003 rewrites it.
- If the middleware `matcher` list changes (new public PWA file), no test here covers it: Next's matcher syntax is not evaluated in unit tests. Consider a build-level check if that list keeps growing.
- Reviewers: confirm the tests assert behavior, not implementation (no mocking of `limiter` or `clientKey`).
