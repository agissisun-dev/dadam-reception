# Auth session recovery boundary

## Confirmed code defect, not a confirmed front-PC diagnosis

The reviewed SDK 2.116.0 paths (GoTrueClient 3113–3140, 4359–4395, 5115–5144) can retain their stored session after a retryable refresh failure while exposing an error and a null INITIAL_SESSION. The former gate treated null callback data as logout and could discard the initial error through its revision counter. The login page also silently exposed password entry on getSession errors. This patch addresses those code paths. It does not establish the actual cause of the reported front-PC incident.

## Behavior and security

- Shared `lib/authSessionRecovery.ts` coordinates both surfaces. Null INITIAL_SESSION does not invalidate bootstrap or prove logout. Explicit getSession errors show recovery, never a false logged-out result.
- Successful getSession(null, error=null) and genuine SIGNED_OUT still mean login. Nonretryable SDK session removal/SIGNED_OUT is not suppressed.
- Recovery offers manual retry. Online/visible events can retry a retryable error at most twice per recovery episode; there is no refresh timer/loop. A user retry starts a new attempt/budget. Unknown/nonretryable errors remain fail-closed and require explicit retry.
- Auth callbacks return synchronously and do not await/call SDK auth or RPC methods. Event-driven getSession and clinic verification run after a task boundary. Generation guards reject old bootstrap, account-switch, sign-out and cleanup results. Null INITIAL_SESSION specifically does not cause the old initial-result-discard race.
- AuthGate renders no patient children until a session email and actual current_clinic RPC authorize the account. Only exact S/N is accepted; RPC errors, missing mapping and host mismatch block access. A valid same-user refresh keeps existing mounted UI during clinic revalidation, as before; an error, account change or sign-out hides it.
- Login defaults to a connection/recovery screen after session-check error. Explicit manual sign-in remains available without calling signOut or deleting retained state; successful direct sign-in routes through the normal protected home gate.
- SDK still exclusively owns stored tokens, refresh and expiry. No raw tokens copied, logged or persisted. No new storage. No patient, email, ID, session-object or credential logging.

## Verification

`lib/authSessionRecovery.test.ts` defines 12 Vitest cases: the same ten actual-coordinator scenarios plus strict task-boundary and null-INITIAL bootstrap-disambiguation assertions. Normal `npm test`/CI discovers this suite; Vitest execution awaits parent dependency wiring/CI. The dependency-free Node runner is named `authSessionRecovery.native-check.mjs`, intentionally outside Vitest test globs; it retains all ten original cases.

Native Node 24 actual-module assertions: **10 passed, 0 failed**. Tests import the production TypeScript coordinator and exercise SDK-like callbacks, retained-storage fixtures, bootstrap orderings, real null, SIGNED_OUT, clinic failures, stale RPC/account changes, cleanup, callback-lock assertions, direct login, same-user UI preservation and bounded retries. These are deterministic coordinator/integration-harness tests, not a live SDK/browser reproduction or a React-rendered end-to-end test.

From repository root:

```text
node --preserve-symlinks --preserve-symlinks-main --test --test-isolation=none lib/authSessionRecovery.native-check.mjs
```

The sandbox needed both symlink flags and no test-process isolation; the default isolated runner timed out. Node's typeless-package warning is harmless; package metadata was not changed. Parent validation should additionally run existing typecheck/lint/build/CI when dependencies are wired. No installed packages or network calls are required by this native runner.

## Changed files only

`components/AuthGate.tsx`, `app/login/page.tsx`, `lib/authSessionRecovery.ts`, `lib/authSessionRecovery.native-check.mjs`, `lib/authSessionRecovery.test.ts`, this document.

No SMS, DB/RLS, account/password, credential, browser, GitHub or deployment changes. No server session policy changes: previously inspected JWT 3600 seconds, global/inactivity limits 0 (never), single-session off, refresh rotation on with 10-second reuse interval remain outside this patch.
