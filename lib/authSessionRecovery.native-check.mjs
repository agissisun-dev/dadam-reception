// Native Node 24 assertions against the actual TypeScript module; no dependencies/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionRecovery, clinicAccess } from './authSessionRecovery.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const user = { user: { id: 'fixture-account', email: 'fixture' } };
const other = { user: { id: 'fixture-other', email: 'fixture' } };
const ok = session => ({ data: { session }, error: null });
const transient = () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 503 } });
function harness(getSession, validate = async () => ({ data: 'S', error: null }), expected = 'S') {
  const seen = []; let readyUser; let callbackLocked = false;
  const coordinator = createAuthSessionRecovery({
    getSession() { assert.equal(callbackLocked, false, 'SDK called inside callback'); return getSession(); },
    onPending(session) { if (!session || session.user.id !== readyUser) { readyUser = undefined; seen.push('checking'); } },
    onRecovery() { readyUser = undefined; seen.push('recovery'); },
    onNoSession() { readyUser = undefined; seen.push('login'); },
    async onSession(session, current) {
      assert.equal(callbackLocked, false, 'RPC called inside callback');
      const { data, error } = await validate(session);
      if (!current()) return;
      const access = clinicAccess(data, error, expected);
      if (access.status === 'allowed') { readyUser = session.user.id; seen.push('ready'); }
      else { readyUser = undefined; seen.push('blocked'); }
    },
  });
  return { coordinator, seen, get readyUser() { return readyUser; }, event(event, session) {
    callbackLocked = true;
    const result = coordinator.onAuthStateChange(event, session);
    assert.equal(result, undefined, 'auth callback must not return an SDK promise');
    callbackLocked = false;
  } };
}

test('retryable bootstrap + null INITIAL retains SDK storage; later retry verifies clinic', async () => {
  const pending = deferred(); let calls = 0; const sdkStorage = new Map([['session', user]]);
  const h = harness(() => ++calls === 1 ? pending.promise : Promise.resolve(ok(sdkStorage.get('session'))));
  h.coordinator.start(); await Promise.resolve();
  h.event('INITIAL_SESSION', null); pending.resolve(transient()); await tick();
  assert.deepEqual(h.seen, ['recovery']); assert.equal(sdkStorage.get('session'), user);
  h.coordinator.retry(); await tick();
  assert.equal(h.readyUser, user.user.id); assert.equal(h.seen.includes('login'), false);
  h.coordinator.dispose();
});
test('null INITIAL after retryable result cannot erase bootstrap error', async () => {
  const h = harness(async () => transient()); h.coordinator.start(); await tick();
  h.event('INITIAL_SESSION', null); await tick();
  assert.deepEqual(h.seen, ['recovery']); h.coordinator.dispose();
});
test('definitive successful null shows login, not recovery', async () => {
  const h = harness(async () => ok(null)); h.coordinator.start(); await tick();
  assert.equal(h.seen.at(-1), 'login'); assert.equal(h.seen.includes('recovery'), false); h.coordinator.dispose();
});
test('genuine SIGNED_OUT beats stale bootstrap, including nonretryable SDK removal', async () => {
  const pending = deferred(); const h = harness(() => pending.promise);
  h.coordinator.start(); await Promise.resolve(); h.event('SIGNED_OUT', null);
  pending.resolve(ok(user)); await tick(); assert.equal(h.seen.at(-1), 'login'); assert.equal(h.readyUser, undefined);
  h.coordinator.dispose();
});
test('strict actual clinic RPC errors, missing/malformed values and wrong clinic deny', async () => {
  for (const response of [{ data: null, error: null }, { data: 'X', error: null }, { data: ['S'], error: null }, { data: 'S', error: {} }, { data: 'N', error: null }]) {
    const h = harness(async () => ok(user), async () => response);
    h.coordinator.start(); await tick(); assert.equal(h.seen.at(-1), 'blocked'); assert.equal(h.readyUser, undefined); h.coordinator.dispose();
  }
  assert.equal(clinicAccess('N', null, null).status, 'allowed');
  assert.equal(clinicAccess(null, null, null).status, 'unmapped');
});
test('account-switch stale RPC and bootstrap results cannot grant old access', async () => {
  const old = deferred(); const h = harness(async () => ok(user), session => session === user ? old.promise : Promise.resolve({ data: 'N', error: null }));
  h.coordinator.start(); await tick(); h.event('SIGNED_IN', other); await tick();
  old.resolve({ data: 'S', error: null }); await tick(); assert.equal(h.seen.at(-1), 'blocked'); assert.equal(h.readyUser, undefined); h.coordinator.dispose();
  const bootstrap = deferred(); const b = harness(() => bootstrap.promise);
  b.coordinator.start(); await Promise.resolve(); b.event('SIGNED_IN', other); await tick(); bootstrap.resolve(ok(null)); await tick();
  assert.equal(b.readyUser, other.user.id); assert.equal(b.seen.includes('login'), false); b.coordinator.dispose();
});
test('cleanup suppresses in-flight bootstrap and RPC completions', async () => {
  const p = deferred(); const h = harness(() => p.promise); h.coordinator.start(); await Promise.resolve(); h.coordinator.dispose(); p.resolve(ok(user)); await tick(); assert.deepEqual(h.seen, []);
  const rpc = deferred(); const b = harness(async () => ok(user), () => rpc.promise); b.coordinator.start(); await tick(); b.coordinator.dispose(); const before = [...b.seen]; rpc.resolve({ data: 'S', error: null }); await tick(); assert.deepEqual(b.seen, before);
});
test('no callback deadlock: null event recovery and direct login are deferred', async () => {
  const h = harness(async () => ok(user)); h.event('TOKEN_REFRESHED', null); await tick(); await tick(); assert.equal(h.readyUser, user.user.id); h.coordinator.dispose();
  const login = harness(async () => ok(null)); login.coordinator.start(); await tick(); login.event('SIGNED_IN', user); assert.equal(login.readyUser, undefined); await tick(); assert.equal(login.readyUser, user.user.id); login.coordinator.dispose();
});
test('valid same-user refresh preserves existing ready UI while RPC rechecks', async () => {
  const next = deferred(); let count = 0;
  const h = harness(async () => ok(user), () => ++count === 1 ? Promise.resolve({ data: 'S', error: null }) : next.promise);
  h.coordinator.start(); await tick(); const before = [...h.seen]; h.event('TOKEN_REFRESHED', user); await tick();
  assert.equal(h.readyUser, user.user.id); assert.deepEqual(h.seen, before);
  next.resolve({ data: null, error: null }); await tick(); assert.equal(h.seen.at(-1), 'blocked'); h.coordinator.dispose();
});
test('online/visibility retries capped at two; nonretryable errors do not auto-retry', async () => {
  let calls = 0; const h = harness(async () => { calls++; return transient(); }); h.coordinator.start(); await tick();
  for (let i = 0; i < 8; i++) { h.coordinator.retry(true); await tick(); }
  assert.equal(calls, 3); assert.equal(h.seen.includes('login'), false);
  h.coordinator.retry(); await tick(); assert.equal(calls, 4); h.coordinator.dispose();
  let otherCalls = 0; const b = harness(async () => { otherCalls++; throw new Error('configuration'); }); b.coordinator.start(); await tick(); b.coordinator.retry(true); await tick(); assert.equal(otherCalls, 1); b.coordinator.dispose();
});
