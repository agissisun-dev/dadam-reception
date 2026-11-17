import { describe, expect, it } from "vitest";
import { createSupplyLoadGate } from "./supplyLoadState";

const data = { clinic: "N", rows: [], pin: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("single authoritative supplies readiness", () => {
  it("does not allow cached unlocks before a complete load", () => {
    const gate = createSupplyLoadGate<typeof data>();
    const cachedUnlocked = true;
    const canOwn = () => gate.read().status === "ready" && cachedUnlocked;
    expect(canOwn()).toBe(false);
    const pending = gate.begin();
    expect(canOwn()).toBe(false);
    gate.fail(pending.generation);
    expect(canOwn()).toBe(false);
  });

  it("only completes after clinic, requests and explicit-null PIN all succeed", async () => {
    const gate = createSupplyLoadGate<typeof data>();
    const pending = gate.begin();
    const clinic = deferred<string>();
    const rows = deferred<never[]>();
    const pin = deferred<null>();
    const task = Promise.all([clinic.promise, rows.promise, pin.promise]).then(([clinic, rows, pin]) => gate.succeed(pending.generation, { clinic, rows, pin }));
    clinic.resolve("N");
    rows.resolve([]);
    await Promise.resolve();
    expect(gate.read().status).toBe("loading");
    pin.resolve(null);
    await task;
    expect(gate.read()).toEqual({ generation: pending.generation, status: "ready", data });
  });

  it("ignores older success arriving after the newer load fails", async () => {
    const gate = createSupplyLoadGate<typeof data>();
    const old = gate.begin();
    const late = deferred<typeof data>();
    const task = late.promise.then((value) => gate.succeed(old.generation, value));
    const current = gate.begin();
    gate.fail(current.generation);
    late.resolve(data);
    expect(await task).toBeNull();
    expect(gate.read()).toEqual({ generation: current.generation, status: "error", data: null });
  });

  it("failure is terminal for a generation, including late PIN save success", () => {
    const gate = createSupplyLoadGate<typeof data>();
    const pending = gate.begin();
    gate.succeed(pending.generation, data);
    gate.fail(pending.generation);
    expect(gate.succeed(pending.generation, data)).toBeNull();
    expect(gate.updateReady(pending.generation, (value) => value)).toBeNull();
    expect(gate.read().status).toBe("error");
  });

  it("a rejected request load stays failed when the PIN arrives later", async () => {
    const gate = createSupplyLoadGate<typeof data>();
    const pending = gate.begin();
    const rows = deferred<never[]>();
    const pin = deferred<null>();
    const task = Promise.all([rows.promise, pin.promise])
      .then(() => gate.succeed(pending.generation, data))
      .catch(() => gate.fail(pending.generation));
    rows.reject(new Error("request lookup failed"));
    await task;
    pin.resolve(null);
    await Promise.resolve();
    expect(gate.read().status).toBe("error");
  });

  it("reload invalidates ready data and ignores stale failures and PIN updates", () => {
    const gate = createSupplyLoadGate<typeof data>();
    const old = gate.begin();
    gate.succeed(old.generation, data);
    const current = gate.begin();
    expect(gate.read()).toEqual({ generation: current.generation, status: "loading", data: null });
    expect(gate.updateReady(old.generation, (value) => value)).toBeNull();
    expect(gate.fail(old.generation)).toBeNull();
    gate.succeed(current.generation, data);
    expect(gate.fail(old.generation)).toBeNull();
    expect(gate.read().status).toBe("ready");
  });

  it("disposed loads cannot publish success or failure", async () => {
    const gate = createSupplyLoadGate<typeof data>();
    const pending = gate.begin();
    const late = deferred<typeof data>();
    const task = late.promise.then((value) => gate.succeed(pending.generation, value));
    gate.dispose();
    late.resolve(data);
    expect(await task).toBeNull();
    expect(gate.fail(pending.generation)).toBeNull();
    expect(gate.read().status).toBe("loading");
    const remounted = gate.begin();
    expect(gate.succeed(remounted.generation, data)?.status).toBe("ready");
  });

  it("PIN save/clear only updates already-ready current data", () => {
    const gate = createSupplyLoadGate<typeof data>();
    const pending = gate.begin();
    expect(gate.updateReady(pending.generation, (value) => value)).toBeNull();
    gate.succeed(pending.generation, data);
    const updated = gate.updateReady(pending.generation, (value) => ({ ...value, pin: null }));
    expect(updated).toEqual({ generation: pending.generation, status: "ready", data });
  });
});
