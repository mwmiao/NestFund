# Plan 003: Ignore client-supplied proxy headers unless `TRUST_PROXY=1`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5df460..HEAD -- src/lib/security.ts src/middleware.ts src/lib/rate-limit.ts tests/security.test.ts tests/middleware.test.ts docker-compose.yml .env.example SECURITY.md`
> If any in-scope file changed since this plan was written (other than by plan
> 002 adding `tests/middleware.test.ts`), compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (code) / MED (behavior change for existing proxy users — see Maintenance notes)
- **Depends on**: `plans/002-test-middleware-and-routes.md` (the middleware tests must exist first)
- **Category**: security
- **Planned at**: commit `ca98cb9`, 2026-11-13; refreshed against `b5df460` on 2026-11-15 (002 merged; test line numbers and lockout counts corrected)

## Why this matters

The login brute-force limit (10 wrong attempts per 10 minutes) is keyed on the client address, which `clientKey()` takes from the `cf-connecting-ip` / `x-forwarded-for` / `x-real-ip` request headers. When the app is reachable directly (the README documents `http://<server-ip>:7777`), the client controls those headers, so every guess can use a fresh fake address and the limit never triggers. `SECURITY.md` says an attacker "never" gets past the limit, which is only true when no such headers are sent. After this plan the headers are trusted only when the operator sets `TRUST_PROXY=1` (for example behind Cloudflare Tunnel or a reverse proxy that overwrites them); otherwise all clients share one bucket.

## Current state

Files:
- `src/lib/security.ts` — pure, edge-safe helpers (the middleware runs in the Edge runtime: no Node-only imports here). Current function:

```ts
// src/lib/security.ts:114-118
/** Best-effort client identity behind a reverse proxy / Cloudflare Tunnel. Only used to tell clients apart for throttling. */
export function clientKey(headers: { get(name: string): string | null }): string {
  const raw = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for')?.split(',')[0] || headers.get('x-real-ip') || 'local';
  return raw.trim().slice(0, 64) || 'local';
}
```

- `src/middleware.ts` — calls `clientKey(req.headers)` (line ~20). Reads `process.env.BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` the same way env vars should be read here.
- `src/lib/rate-limit.ts` — `tooMany()` and `rateLimited()` also call `clientKey(...)` for server actions and route handlers. They need no edits if `clientKey`'s default does the right thing.
- `tests/security.test.ts` lines 131-136 — current test "identifies clients behind a proxy":

```ts
it('identifies clients behind a proxy', () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  expect(clientKey(h({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
  expect(clientKey(h({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8');
  expect(clientKey(h({}))).toBe('local');
});
```

- `tests/middleware.test.ts` — created by plan 002; test 9 documents the current (header-keyed) behavior.
- `docker-compose.yml` (service `nestfund`, `environment:` block), `.env.example`, `SECURITY.md` (table row "Autenticação (opcional)", line ~12, and the limitation bullet about request limits, line ~29) — configuration and docs to update.

Conventions: env flags are read from `process.env` at call time (see `src/middleware.ts`). `SECURITY.md` is in Portuguese (pt-PT); `.env.example` comments are in English. The decision recorded here: default is **not** trusted, and untrusted means one shared bucket `'local'` (this is the behavior `SECURITY.md` already describes for "no proxy headers").

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| Targeted tests | `npx vitest run tests/security.test.ts tests/middleware.test.ts` | all pass |
| All tests | `npm test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/security.ts` — `clientKey` and one new helper
- `tests/security.test.ts` — the "identifies clients behind a proxy" test
- `tests/middleware.test.ts` — test 9 and new cases
- `docker-compose.yml`, `.env.example`, `SECURITY.md`

**Out of scope** (do NOT touch):
- `src/middleware.ts` and `src/lib/rate-limit.ts` (they must work unchanged through the default argument).
- Per-account login, cookies, or any new auth mechanism.
- `README.md` / `README.en-US.md` (leave for the maintainer; mention in the report if you think a line is needed).

## Git workflow

- Branch: `advisor/003-trust-proxy`
- One commit, short imperative message (e.g. `Trust proxy headers only when TRUST_PROXY=1`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `clientKey` honor an explicit trust flag

In `src/lib/security.ts` replace `clientKey` with:

```ts
/** True when the operator says a reverse proxy / tunnel in front of the app sets the client-address headers itself. */
export const trustProxyHeaders = (): boolean => process.env.TRUST_PROXY === '1';

/**
 * Client identity used only to tell clients apart for throttling. The address headers are sent by the client
 * unless a trusted proxy overwrites them, so they are read only when TRUST_PROXY=1; otherwise everyone shares one key.
 */
export function clientKey(headers: { get(name: string): string | null }, trustProxy: boolean = trustProxyHeaders()): string {
  if (!trustProxy) return 'local';
  const raw = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for')?.split(',')[0] || headers.get('x-real-ip') || 'local';
  return raw.trim().slice(0, 64) || 'local';
}
```

Do not add any import to this file (it must stay edge-safe; `process.env` is fine, `src/middleware.ts` already uses it).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Update the unit test in `tests/security.test.ts`

Replace the "identifies clients behind a proxy" test with two tests: (a) with the explicit argument `true`, the three assertions of the old test still hold (`clientKey(h({...}), true)`); (b) with `false`, every header combination returns `'local'`, including `{ 'cf-connecting-ip': '1.2.3.4' }`. Keep the existing helper `h`.

**Verify**: `npx vitest run tests/security.test.ts` → all pass.

### Step 3: Update `tests/middleware.test.ts`

- In `beforeEach` add `delete process.env.TRUST_PROXY`; in `afterEach` delete it again.
- The lockout in this codebase answers 401 to the first **11** wrong attempts and 429 from the **12th** (the block is checked before the attempt is counted; plan 002's test "locks out a client once more than 10 wrong attempts…" pins this). Keep that count; do not change `RateLimiter`.
- Rewrite the last test (marked "Current behavior: clients are told apart by proxy headers", named "does not block a different client address while another is blocked") as: **without** `TRUST_PROXY`, 11 wrong attempts with rotating `cf-connecting-ip` values (`1.0.0.1` … `1.0.0.11`, each answered 401), then a 12th wrong attempt with yet another fake address → `429`, and a correct-password request from a further fake address → `429` too. (This is the bypass this plan closes.)
- The other lockout tests that send `cf-connecting-ip: 9.9.9.9` without `TRUST_PROXY` still pass (everyone shares the key `'local'`); leave them alone.
- Add: **with** `process.env.TRUST_PROXY = '1'`, 11 wrong attempts from `9.9.9.9` (each 401), then a 12th from `9.9.9.9` → 429 and a correct-password request from `9.9.9.9` → 429, but a correct-password request from `8.8.8.8` passes.

**Verify**: `npx vitest run tests/middleware.test.ts` → all pass.

### Step 4: Configuration and docs

- `docker-compose.yml`: in the `environment:` block add `TRUST_PROXY: ${TRUST_PROXY:-}` (after `BASIC_AUTH_PASSWORD`).
- `.env.example`: append

```
# Set to 1 only when a trusted reverse proxy / Cloudflare Tunnel in front of the app sets the client-address
# headers itself. Leave empty when the port is reachable directly: otherwise anyone could fake an address
# and bypass the login attempt limit.
TRUST_PROXY=
```

- `SECURITY.md`: (1) in the "Autenticação (opcional)" table row, after "bloqueio temporário (429) após 10 tentativas falhadas" change "do mesmo endereço" to "no mesmo conjunto de clientes" and add: "Os cabeçalhos de endereço (`CF-Connecting-IP`, `X-Forwarded-For`) só são usados se definires `TRUST_PROXY=1`." (2) Replace the limitation bullet about request limits (the one starting "Os limites de pedidos são em memória") with: "Os limites de pedidos são em memória, por processo, e reiniciam com o servidor. Por defeito todos os clientes contam como um só (os cabeçalhos de endereço podem ser forjados): um atacante pode bloquear temporariamente o início de sessão, mas nunca ultrapassar o limite. Se usas Cloudflare Tunnel ou um proxy que define esses cabeçalhos, define `TRUST_PROXY=1` para limitar por endereço."

**Verify**: `grep -n "TRUST_PROXY" docker-compose.yml .env.example SECURITY.md` → at least one match in each file.

### Step 5: Full suite

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

## Test plan

Covered in Steps 2–3: unit tests for `clientKey` with the flag on/off, and middleware tests proving (a) rotating fake addresses cannot bypass the lockout by default and (b) with `TRUST_PROXY=1` clients are separated by address. Pattern: existing `tests/security.test.ts` and plan 002's `tests/middleware.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -n "trustProxyHeaders" src/lib/security.ts` shows the new helper, and `src/middleware.ts` / `src/lib/rate-limit.ts` are unmodified (`git diff --stat` lists neither)
- [ ] `grep -n "TRUST_PROXY" docker-compose.yml .env.example SECURITY.md` matches in all three
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `tests/middleware.test.ts` does not exist (plan 002 not done).
- The excerpts above do not match the source (drift).
- The Edge runtime build rejects `process.env.TRUST_PROXY` in `security.ts` (run `npm run build` only if the operator allows a build; otherwise note that this was not verified).
- You find another place that reads `cf-connecting-ip`, `x-forwarded-for` or `x-real-ip` directly (`grep -rn "x-forwarded-for\|cf-connecting-ip\|x-real-ip" src`) — report it instead of fixing it silently.

## Maintenance notes

- **Behavior change for existing deployments**: anyone running behind Cloudflare Tunnel with Basic Auth now gets a single shared lockout bucket until they set `TRUST_PROXY=1`. The worst case is that 10 wrong attempts (by anyone) lock everyone, including the owner, for up to 10 minutes. This is called out in `SECURITY.md`; mention it in release notes.
- Server-action limits (`tooMany`) and route limits (`rateLimited`) share `clientKey`, so they also become global-per-instance by default; with a single-user app this is acceptable.
- Reviewers: confirm `clientKey` still has no imports and that the default argument is evaluated per call (so tests can flip the env var).
- Deferred: real sessions/login (cookie-based) would make per-address throttling unnecessary — product decision, not part of this plan.
