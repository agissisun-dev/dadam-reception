"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { forgetClinic, type ClinicCode } from "@/lib/clinic";
import { CLINIC_TITLES, CLINIC_URLS, clinicFromHostname } from "@/lib/clinicHosts";

type Props = { children: (email: string) => ReactNode };
type AccessState =
  | { status: "checking" }
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
    let active = true;
    let revision = 0;
    let verifiedUserId: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const isCurrent = (version: number) => active && revision === version;
    const lookupFailure = () => {
      verifiedUserId = null;
      setAccess({
        status: "blocked",
        message: "계정의 병원을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요. 계속되면 원장님께 계정 확인을 요청해 주세요.",
      });
    };

    async function validateSession(session: Session | null, version: number) {
      if (!isCurrent(version)) return;
      const email = session?.user.email;
      if (!email) {
        router.replace("/login");
        return;
      }
      const controller = new AbortController();
      request = controller;
      try {
        // 캐시나 S 기본값이 아니라 로그인한 계정의 실제 병원을 확인한다.
        const { data, error } = await supabase.rpc("current_clinic").abortSignal(controller.signal);
        if (!isCurrent(version)) return;
        const actualClinic: ClinicCode | null = data === "S" || data === "N" ? data : null;
        if (error) {
          lookupFailure();
        } else if (!actualClinic) {
          verifiedUserId = null;
          setAccess({
            status: "blocked",
            message: "이 계정에 연결된 병원이 없습니다. 원장님께 계정의 병원 연결을 확인해 달라고 요청해 주세요.",
          });
        } else if (expectedClinic && actualClinic !== expectedClinic) {
          verifiedUserId = null;
          setAccess({
            status: "blocked",
            message: `이 주소는 ${CLINIC_TITLES[expectedClinic]} 전용입니다. 현재 계정은 ${CLINIC_TITLES[actualClinic]} 계정입니다. 아래 주소로 이동하거나, 이 탭에서 로그아웃한 뒤 알맞은 계정으로 로그인해 주세요.`,
            actualClinic,
          });
        } else {
          verifiedUserId = session?.user.id ?? null;
          setAccess({ status: "ready", email });
        }
      } catch {
        if (isCurrent(version)) lookupFailure();
      }
    }

    function scheduleValidation(session: Session | null) {
      if (!active) return;
      const version = ++revision;
      clearTimeout(timer);
      request?.abort();
      const userId = session?.user.id ?? null;
      // 같은 계정의 토큰 갱신·탭 복귀는 본문을 유지하며 뒤에서 재확인한다.
      // 매번 본문을 내리면 작성 중인 접수실 입력이 사라질 수 있다.
      if (!userId || userId !== verifiedUserId) {
        verifiedUserId = null;
        forgetClinic();
        setAccess({ status: "checking" });
      }
      // auth 콜백 안에서 Supabase를 await하면 내부 잠금과 교착할 수 있다.
      timer = setTimeout(() => { void validateSession(session, version); }, 0);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      scheduleValidation(session);
    });

    const initialRevision = revision;
    void supabase.auth.getSession().then(({ data, error }) => {
      // 그 사이 도착한 auth 변경보다 오래된 초기 결과는 버린다.
      if (!isCurrent(initialRevision)) return;
      if (error) lookupFailure();
      else scheduleValidation(data.session);
    }).catch(() => {
      if (isCurrent(initialRevision)) lookupFailure();
    });

    return () => {
      active = false;
      ++revision;
      clearTimeout(timer);
      request?.abort();
      sub.subscription.unsubscribe();
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
