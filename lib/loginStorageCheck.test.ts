import { test, expect } from "vitest";
import { checkLoginStorage, type LoginCheckStorage, type LoginStorageCheckInput } from "./loginStorageCheck";

const authKey = "sb-fixtureproject-auth-token";
const probeKey = "aside.login-check.fixture-random-123";
const now = new Date("2026-11-17T01:02:03.000Z");

function fixture(initial: [string, string][] = []) {
  const values = new Map(initial);
  const writes: [string, string][] = [];
  const removals: string[] = [];
  const reads: string[] = [];
  const storage: LoginCheckStorage = {
    getItem(key) { reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); values.set(key, value); },
    removeItem(key) { removals.push(key); values.delete(key); },
  };
  return { values, writes, removals, reads, storage };
}

function run(storage: LoginCheckStorage, overrides: Partial<LoginStorageCheckInput> = {}) {
  return checkLoginStorage({
    href: "https://reception.example/login?code=private-query#access_token=private-hash",
    now,
    online: true,
    publicSupabaseUrl: "https://fixtureproject.supabase.co",
    getStorage: () => storage,
    randomId: () => "fixture-random-123",
    ...overrides,
  });
}

function denied(): never { throw new DOMException("private-error-detail", "SecurityError"); }

test("writable storage is restored exactly, including repeated use of the same probe name", () => {
  const f = fixture([[authKey, "private-auth-value"], ["unrelated", "keep-me"]]);
  const before = [...f.values];
  for (let i = 0; i < 2; i++) {
    expect(run(f.storage)).toEqual({
      address: "https://reception.example/login",
      checkedAt: "2026-11-17T01:02:03.000Z",
      online: true,
      storageWritable: "possible",
      authKeyPresent: "yes",
    });
    expect([...f.values]).toEqual(before);
  }
  expect(f.writes).toEqual([[probeKey, "login-check"], [probeKey, "login-check"]]);
  expect(f.removals).toEqual([probeKey, probeKey]);
});

test("null means absent, and even an empty stored string means present", () => {
  expect(run(fixture().storage).authKeyPresent).toBe("no");
  expect(run(fixture([[authKey, ""]]).storage).authKeyPresent).toBe("yes");
});

test("storage getter SecurityError is unavailable, not false absence", () => {
  const f = fixture();
  const result = run(f.storage, { getStorage: denied });
  expect(result.storageWritable).toBe("not-possible");
  expect(result.authKeyPresent).toBe("unknown");
  expect(f.reads).toEqual([]);
  expect(f.writes).toEqual([]);
});

test("blocked reads are unknown and do not trigger writes or removal", () => {
  const f = fixture();
  f.storage.getItem = denied;
  const result = run(f.storage);
  expect(result.storageWritable).toBe("not-possible");
  expect(result.authKeyPresent).toBe("unknown");
  expect(f.writes).toEqual([]);
  expect(f.removals).toEqual([]);
});

test("quota failure cannot make an existing auth entry appear absent", () => {
  const f = fixture([[authKey, "private-auth-value"]]);
  f.storage.setItem = () => { throw new DOMException("private-quota-detail", "QuotaExceededError"); };
  const result = run(f.storage);
  expect(result.storageWritable).toBe("not-possible");
  expect(result.authKeyPresent).toBe("yes");
  expect(f.removals).toEqual([probeKey]);
  expect([...f.values]).toEqual([[authKey, "private-auth-value"]]);
});

test("auth read failure remains unknown even if the probe is writable", () => {
  const f = fixture();
  const read = f.storage.getItem;
  f.storage.getItem = (key) => key === authKey ? denied() : read(key);
  expect(run(f.storage)).toMatchObject({ storageWritable: "possible", authKeyPresent: "unknown" });
  expect(f.values.size).toBe(0);
});

test("read-after-write failure still removes the owned probe in finally", () => {
  const f = fixture();
  const read = f.storage.getItem;
  f.storage.getItem = (key) => key === probeKey && f.values.has(key) ? denied() : read(key);
  expect(run(f.storage).storageWritable).toBe("not-possible");
  expect(f.values.size).toBe(0);
  expect(f.removals).toEqual([probeKey]);
});

test("a failed read-back comparison still cleans up", () => {
  const f = fixture();
  const read = f.storage.getItem;
  f.storage.getItem = (key) => key === probeKey && f.values.has(key) ? "not-the-probe" : read(key);
  expect(run(f.storage).storageWritable).toBe("not-possible");
  expect(f.values.size).toBe(0);
  expect(f.removals).toEqual([probeKey]);
});

test("cleanup failure is not reported as a successful storage test", () => {
  const f = fixture();
  f.storage.removeItem = denied;
  expect(run(f.storage).storageWritable).toBe("not-possible");
  expect(f.values.get(probeKey)).toBe("login-check");
});

test("a colliding own-namespace entry is preserved without writes or removal", () => {
  const f = fixture([[probeKey, "private-existing-probe"], [authKey, "private-auth-value"]]);
  const before = [...f.values];
  expect(run(f.storage)).toMatchObject({ storageWritable: "not-possible", authKeyPresent: "yes" });
  expect([...f.values]).toEqual(before);
  expect(f.writes).toEqual([]);
  expect(f.removals).toEqual([]);
});

test.each([undefined, "", "not a URL", "https://custom.example", "http://fixtureproject.supabase.co"])("unrecognized public project URL %s stays unknown", (publicSupabaseUrl) => {
  const f = fixture([[authKey, "private-auth-value"]]);
  expect(run(f.storage, { publicSupabaseUrl }).authKeyPresent).toBe("unknown");
  expect(f.reads.every(key => key === probeKey)).toBe(true);
});

test("default key comes from the public project hostname, not its query or fragment", () => {
  const f = fixture([["sb-otherproject-auth-token", "private-auth-value"]]);
  expect(run(f.storage, { publicSupabaseUrl: "https://otherproject.supabase.co/?private=query#private" }).authKeyPresent).toBe("yes");
  expect(f.reads).toContain("sb-otherproject-auth-token");
  expect(f.reads).not.toContain(authKey);
  expect(f.writes.every(([key]) => key === probeKey)).toBe(true);
  expect(f.removals.every(key => key === probeKey)).toBe(true);
});

test("result contains only the five approved fields, no sensitive stored data or keys", () => {
  const sensitive = JSON.stringify({ email: "private@example.test", user_id: "private-user-id", password: "private-password", access_token: "private-token", expires_at: 999999 });
  const f = fixture([[authKey, sensitive], ["another-key", "private-other-value"]]);
  const result = run(f.storage);
  expect(Object.keys(result).sort()).toEqual(["address", "authKeyPresent", "checkedAt", "online", "storageWritable"].sort());
  const serialized = JSON.stringify(result);
  for (const secret of [sensitive, "private@example.test", "private-user-id", "private-password", "private-token", "999999", authKey, probeKey, "private-query", "private-hash"]) {
    expect(serialized).not.toContain(secret);
  }
  expect(f.reads).not.toContain("another-key");
  expect(f.writes.some(([key]) => key === authKey)).toBe(false);
  expect(f.removals).not.toContain(authKey);
});

test("only origin and pathname survive, without credentials, query, or hash", () => {
  const result = run(fixture().storage, { href: "https://private-user:private-password@reception.example:8443/login/recovery?email=private#token=private", online: false });
  expect(result.address).toBe("https://reception.example:8443/login/recovery");
  expect(result.online).toBe(false);
  expect(run(fixture().storage, { href: "invalid-private-address" }).address).toBe("확인 불가");
});

test("random generation failure or invalid IDs do not write, remove, or expose errors", () => {
  for (const randomId of [denied, () => "../invalid", () => ""]) {
    const f = fixture([[authKey, "private-auth-value"]]);
    const result = run(f.storage, { randomId });
    expect(result).toMatchObject({ storageWritable: "not-possible", authKeyPresent: "yes" });
    expect(f.writes).toEqual([]);
    expect(f.removals).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private-error-detail");
  }
});
