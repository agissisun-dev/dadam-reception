/** SDK owns persistence/refresh. This module never reads or writes tokens/storage. */
export type SessionLike = { user: { id: string; email?: string } };
export type SessionResult<S> = { data: { session: S | null }; error: unknown };
export type Current = () => boolean;

export function isRetryableSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; status?: number };
  return e.name === "AuthRetryableFetchError" || e.name === "TypeError" ||
    e.status === 0 || e.status === 408 || e.status === 429 ||
    (typeof e.status === "number" && e.status >= 500);
}

export function clinicAccess(data: unknown, error: unknown, expected: "S" | "N" | null) {
  if (error) return { status: "error" } as const;
  if (data !== "S" && data !== "N") return { status: "unmapped" } as const;
  if (expected && data !== expected) return { status: "mismatch", actual: data } as const;
  return { status: "allowed", actual: data } as const;
}

/** One coordinator per mounted effect. All SDK work triggered by auth events is deferred.
 * INITIAL_SESSION(null) is NOT an authoritative absence: getSession's error is needed.
 * Only genuine SIGNED_OUT or a successful null getSession result means no session.
 */
export function createAuthSessionRecovery<S extends SessionLike>(options: {
  getSession: () => Promise<SessionResult<S>>;
  onPending: (session: S | null) => void;
  onSession: (session: S, current: Current) => void | Promise<void>;
  onNoSession: () => void;
  onRecovery: (retryable: boolean) => void;
}) {
  let active = true;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let recovering = false;
  let automaticAllowed = false;
  let automaticAttempts = 0;
  let reading = false;
  const current = (version: number) => () => active && revision === version;
  function invalidate() {
    clearTimeout(timer);
    reading = false;
    return ++revision;
  }
  function recovery(error: unknown) {
    recovering = true;
    automaticAllowed = isRetryableSessionError(error);
    options.onRecovery(automaticAllowed);
  }
  function accept(session: S | null, version: number) {
    if (!current(version)()) return;
    recovering = false;
    automaticAttempts = 0;
    if (!session) { options.onPending(null); options.onNoSession(); return; }
    options.onPending(session);
    // Also deferred for bootstrap, keeping one validation path and a stale-result guard.
    timer = setTimeout(() => {
      if (current(version)()) void Promise.resolve(options.onSession(session, current(version))).catch(() => {
        if (current(version)()) recovery(new Error("Session verification failed"));
      });
    }, 0);
  }
  function read() {
    if (!active) return;
    const version = invalidate();
    reading = true;
    void Promise.resolve().then(() => {
      if (!current(version)()) return;
      return options.getSession();
    }).then((result) => {
      if (!result || !current(version)()) return;
      reading = false;
      if (result.error) recovery(result.error);
      else accept(result.data.session, version);
    }).catch((error: unknown) => {
      if (current(version)()) { reading = false; recovery(error); }
    });
  }
  return {
    start: read,
    retry(automatic = false) {
      if (!active || reading) return;
      if (automatic) {
        if (!recovering || !automaticAllowed || automaticAttempts >= 2) return;
        automaticAttempts++;
      } else automaticAttempts = 0;
      read();
    },
    onAuthStateChange(event: string, session: S | null) {
      if (!active) return;
      if (event === "INITIAL_SESSION" && !session) return;
      const version = invalidate();
      // Invalidate in-flight verification immediately, but never call SDK under its lock.
      if (event === "SIGNED_OUT") {
        recovering = false;
        options.onPending(null);
        timer = setTimeout(() => { if (current(version)()) options.onNoSession(); }, 0);
      } else if (session) {
        accept(session, version);
      } else {
        options.onPending(null);
        timer = setTimeout(() => { if (current(version)()) read(); }, 0);
      }
    },
    dispose() { active = false; invalidate(); },
  };
}
