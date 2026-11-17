"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { clinicAccess, createAuthSessionRecovery } from "@/lib/authSessionRecovery";
import { forgetClinic, type ClinicCode } from "@/lib/clinic";
import { CLINIC_TITLES, CLINIC_URLS, clinicFromHostname } from "@/lib/clinicHosts";

type Props = { children: (email: string) => ReactNode };
type AccessState =
  | { status: "checking" }
  | { status: "recovering" }
  | { status: "ready"; email: string }
  | { status: "blocked"; message: string; actualClinic?: ClinicCode };

export default function AuthGate({ children }: Props) {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>({ status: "checking" });
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [configError] = useState<string | null>(() => {
    try {
      getSupabase();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  });

  useEffect(() => {
    if (configError) return;
    const supabase = getSupabase();
    const expectedClinic = clinicFromHostname(window.location.hostname);
    let verifiedUserId: string | null = null;
    let request: AbortController | undefined;
    const lookupFailure = () => {
      verifiedUserId = null;
      setAccess({ status: "blocked", message: "계정의 병원을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요. 계속되면 원장님께 계정 확인을 요청해 주세요." });
    };
    const recovery = createAuthSessionRecovery<Session>({
      getSession: () => supabase.auth.getSession(),
      onPending(session) {
        request?.abort();
        // Preserve mounted input only for a valid same-user refresh, not uncertainty.
        if (!session || session.user.id !== verifiedUserId) {
          verifiedUserId = null;
          forgetClinic();
          setAccess({ status: "checking" });
        }
      },
      onNoSession() { forgetClinic(); router.replace("/login"); },
      onRecovery() {
        request?.abort();
        verifiedUserId = null;
        forgetClinic();
        setAccess({ status: "recovering" });
      },
      async onSession(session, current) {
        if (!session.user.email) { lookupFailure(); return; }
        const controller = new AbortController();
        request = controller;
        try {
          // Always authorize against the actual account RPC, never cached/default S.
          const { data, error } = await supabase.rpc("current_clinic").abortSignal(controller.signal);
          if (!current()) return;
          const result = clinicAccess(data, error, expectedClinic);
          if (result.status === "error") lookupFailure();
          else if (result.status === "unmapped") {
            verifiedUserId = null;
            setAccess({ status: "blocked", message: "이 계정에 연결된 병원이 없습니다. 원장님께 계정의 병원 연결을 확인해 달라고 요청해 주세요." });
          } else if (result.status === "mismatch") {
            verifiedUserId = null;
            setAccess({ status: "blocked", actualClinic: result.actual, message: "이 주소는 " + CLINIC_TITLES[expectedClinic!] + " 전용입니다. 현재 계정은 " + CLINIC_TITLES[result.actual] + " 계정입니다. 아래 주소로 이동하거나, 이 탭에서 로그아웃한 뒤 알맞은 계정으로 로그인해 주세요." });
          } else {
            verifiedUserId = session.user.id;
            setAccess({ status: "ready", email: session.user.email });
          }
        } catch { if (current()) lookupFailure(); }
      },
    });
    const { data: sub } = supabase.auth.onAuthStateChange(recovery.onAuthStateChange);
    recovery.start();
    const retryOnline = () => { if (navigator.onLine) recovery.retry(true); };
    const retryVisible = () => { if (document.visibilityState === "visible") retryOnline(); };
    window.addEventListener("online", retryOnline);
    document.addEventListener("visibilitychange", retryVisible);
    return () => {
      recovery.dispose();
      request?.abort();
      sub.subscription.unsubscribe();
      window.removeEventListener("online", retryOnline);
      document.removeEventListener("visibilitychange", retryVisible);
    };
  }, [router, configError, retry]);

  async function logoutHere() {
    setSigningOut(true);
    setLogoutError(null);
    try {
      const { error } = await getSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      forgetClinic();
      router.replace("/login");
    } catch {
      setLogoutError("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSigningOut(false);
    }
  }

  if (configError) {
    return (
      <main className="p-6 text-red-700">
        연결 설정 오류: {configError}
      </main>
    );
  }
  if (access.status === "recovering") {
    return (
      <main className="mx-auto mt-16 max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-bold">로그인 연결 복구가 필요합니다</h1>
        <p role="alert" className="text-sm leading-6 text-stone-700">연결 문제로 저장된 로그인 상태를 확인하지 못했습니다. 로그아웃된 것으로 처리하지 않았습니다. 연결을 확인하고 다시 시도해 주세요.</p>
        <button type="button" onClick={() => { setAccess({ status: "checking" }); setRetry((value) => value + 1); }} className="rounded border px-3 py-2 text-sm">다시 확인</button>
        <Link href="/login" className="block text-sm text-blue-700 underline">로그인 확인 화면 열기</Link>
      </main>
    );
  }
  if (access.status === "blocked") {
    return (
      <main className="mx-auto mt-16 max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-bold">접수실 계정을 확인해 주세요</h1>
        <p role="alert" className="text-sm leading-6 text-stone-700">{access.message}</p>
        {access.actualClinic && (
          <a className="block font-medium text-blue-700 underline" href={CLINIC_URLS[access.actualClinic]} target="_blank" rel="noopener noreferrer">
            {CLINIC_TITLES[access.actualClinic]} 열기
          </a>
        )}
        <p className="text-xs text-stone-500">다른 병원 주소의 로그인 상태는 바뀌지 않습니다.</p>
        {logoutError && <p role="alert" className="text-sm text-red-700">{logoutError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={signingOut} onClick={() => { setAccess({ status: "checking" }); setRetry((value) => value + 1); }} className="rounded border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">
            다시 확인
          </button>
          <button type="button" disabled={signingOut} onClick={logoutHere} className="rounded bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            {signingOut ? "로그아웃 중…" : "이 주소에서 로그아웃하고 다시 로그인"}
          </button>
        </div>
      </main>
    );
  }
  if (access.status === "checking") {
    return <main role="status" className="p-6 text-stone-500">로그인과 병원 확인 중…</main>;
  }
  return <>{children(access.email)}</>;
}
