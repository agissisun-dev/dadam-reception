/** Diagnostic only: no SDK, cookies, network, payload parsing, or auth mutation. */
export interface LoginCheckStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoginStorageCheckInput {
  href: string;
  now: Date;
  online: boolean;
  publicSupabaseUrl: string | undefined;
  getStorage: () => LoginCheckStorage;
  randomId: () => string;
}

export interface LoginStorageCheckResult {
  address: string;
  checkedAt: string;
  online: boolean;
  storageWritable: "possible" | "not-possible";
  authKeyPresent: "yes" | "no" | "unknown";
}

/** Only the default hosted-project key is checked; unknown configuration stays unknown. */
function defaultAuthKey(publicUrl: string | undefined): string | null {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    const project = /^([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname);
    return url.protocol === "https:" && project ? "sb-" + project[1] + "-auth-token" : null;
  } catch {
    return null;
  }
}

function safeAddress(href: string): string {
  try {
    const url = new URL(href);
    return url.origin + url.pathname;
  } catch {
    return "확인 불가";
  }
}

function probeWritable(storage: LoginCheckStorage, randomId: () => string): boolean {
  let probeKey: string | undefined;
  let ownsProbe = false;
  let writable = false;
  try {
    const id = randomId();
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(id)) return false;
    probeKey = "aside.login-check." + id;
    // A collision is never overwritten or removed, even in the diagnostic namespace.
    if (storage.getItem(probeKey) !== null) return false;
    ownsProbe = true;
    storage.setItem(probeKey, "login-check");
    writable = storage.getItem(probeKey) === "login-check";
  } catch {
    writable = false;
  } finally {
    if (ownsProbe && probeKey) {
      try {
        storage.removeItem(probeKey);
      } catch {
        writable = false;
      }
    }
  }
  return writable;
}

/** All browser access is injected and must only be supplied from a user click handler. */
export function checkLoginStorage(input: LoginStorageCheckInput): LoginStorageCheckResult {
  const result: LoginStorageCheckResult = {
    address: safeAddress(input.href),
    checkedAt: input.now.toISOString(),
    online: input.online,
    storageWritable: "not-possible",
    authKeyPresent: "unknown",
  };
  let storage: LoginCheckStorage;
  try {
    // Accessing window.localStorage itself can throw SecurityError.
    storage = input.getStorage();
  } catch {
    return result;
  }
  result.storageWritable = probeWritable(storage, input.randomId) ? "possible" : "not-possible";
  const authKey = defaultAuthKey(input.publicSupabaseUrl);
  if (authKey) {
    try {
      // Inspect presence only. Never parse, return, log, or render the stored value or key.
      result.authKeyPresent = storage.getItem(authKey) === null ? "no" : "yes";
    } catch {
      result.authKeyPresent = "unknown";
    }
  }
  return result;
}
