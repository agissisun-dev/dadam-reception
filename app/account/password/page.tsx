"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";
import type { ClinicCode } from "@/lib/clinic";
import { CLINIC_TITLES, clinicFromHostname } from "@/lib/clinicHosts";

type Access =
  | { status: "checking" }
  | { status: "signed-out" }
  | { status: "blocked"; message: string }
  | { status: "ready"; userId: string; email: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sessionFailure = "로그인 상태를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 확인해 주세요.";

function recoveryError(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const failed = [hash, query].find((params) =>
    params.has("error") || params.has("error_code") || params.has("error_description"),
  );
  if (!failed) return null;
  // URL에서 온 설명이나 토큰을 그대로 화면에 출력하지 않는다.
  if (failed.get("error_code") === "otp_expired") {
    return "비밀번호 설정 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 요청해 주세요.";
  }
  return "비밀번호 설정 링크를 확인하지 못했습니다. 새 링크를 요청해 주세요.";
}

function mailError(error: unknown): string {
  const details = error && typeof error === "object" ? error as { status?: unknown; code?: unknown } : null;
  if (details?.status === 429 || details?.code === "over_email_send_rate_limit") {
    return "메일 발송 한도 또는 요청 횟수 제한에 도달했습니다. 이메일 주소가 틀렸다는 뜻은 아닙니다. 충분히 기다린 뒤 다시 요청하거나 관리자에게 메일 발송 한도 확인을 요청해 주세요.";
  }
  return "설정 메일을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function PasswordPage() {
  const [access, setAccess] = useState<Access>({ status: "checking" });
  const [expectedClinic, setExpectedClinic] = useState<ClinicCode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  const identity = useRef<string | null>(null);
  const accessRef = useRef<Access>({ status: "checking" });

  useEffect(() => {
    mounted.current = true;
    const expected = clinicFromHostname(window.location.hostname);
    setExpectedClinic(expected);
    setLinkError(recoveryError());
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const current = (version: number) => active && revision.current === version;
    function publish(next: Access) {
      if (!active) return;
      accessRef.current = next;
      setAccess(next);
    }
    function fail(message: string) {
      publish({ status: "blocked", message });
    }
    let supabase: ReturnType<typeof getSupabase>;
    try {
      supabase = getSupabase();
    } catch {
      fail("접수실 연결 설정을 확인하지 못했습니다. 관리자에게 문의해 주세요.");
      return () => { active = false; mounted.current = false; ++revision.current; };
    }

    async function validateSession(session: Session | null, version: number) {
      if (!current(version)) return;
      if (!session) {
        publish({ status: "signed-out" });
        return;
      }
      const accountEmail = session.user.email;
      if (!accountEmail || !emailPattern.test(accountEmail)) {
        fail("이메일이 확인되는 계정이 필요합니다. 관리자에게 계정을 확인해 달라고 요청해 주세요.");
        return;
      }
      const controller = new AbortController();
      request = controller;
      try {
        // 캐시나 기본 병원을 사용하지 않고 현재 세션의 실제 병원을 조회한다.
        const { data, error: lookupError } = await supabase.rpc("current_clinic").abortSignal(controller.signal);
        if (!current(version)) return;
        const actualClinic = data === "S" || data === "N" ? data : null;
        if (lookupError) {
          fail("계정의 병원을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 확인해 주세요.");
        } else if (!actualClinic) {
          fail("이 계정에 연결된 병원이 없습니다. 관리자에게 계정의 병원 연결을 확인해 달라고 요청해 주세요.");
        } else if (expected && actualClinic !== expected) {
          fail(`이 주소는 ${CLINIC_TITLES[expected]} 전용입니다. 현재 계정은 ${CLINIC_TITLES[actualClinic]} 계정이므로 여기서 비밀번호를 변경할 수 없습니다. 해당 병원 주소에서 설정해 주세요.`);
        } else {
          publish({ status: "ready", userId: session.user.id, email: accountEmail });
        }
      } catch {
        if (current(version)) fail("계정의 병원을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.");
      }
    }

    function scheduleValidation(session: Session | null) {
      if (!active) return;
      const version = ++revision.current;
      clearTimeout(timer);
      request?.abort();
      const nextIdentity = session ? JSON.stringify([session.user.id, session.user.email]) : null;
      if (identity.current !== nextIdentity) {
        setPassword("");
        setConfirmation("");
        setSaved(false);
        setError(null);
        setMessage(null);
      }
      identity.current = nextIdentity;
      publish({ status: "checking" });
      // auth 콜백 내부에서는 Supabase를 호출하거나 await하지 않는다.
      timer = setTimeout(() => { void validateSession(session, version); }, 0);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      scheduleValidation(session);
    });
    const initialRevision = revision.current;
    void supabase.auth.getSession().then(({ data, error: initialError }) => {
      if (!current(initialRevision)) return;
      if (initialError) fail(sessionFailure);
      else scheduleValidation(data.session);
    }).catch(() => {
      if (current(initialRevision)) fail(sessionFailure);
    });

    return () => {
      active = false;
      mounted.current = false;
      ++revision.current;
      clearTimeout(timer);
      request?.abort();
      subscription.subscription.unsubscribe();
    };
  }, [retry]);

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || accessRef.current.status !== "signed-out") return;
    const trimmedEmail = email.trim();
    setError(null);
    setMessage(null);
    if (!emailPattern.test(trimmedEmail)) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    const version = revision.current;
    try {
      // 복구 요청만 하며 가입이나 새 사용자 생성은 하지 않는다.
      const { error: sendError } = await getSupabase().auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: new URL("/account/password", window.location.origin).href,
      });
      if (!mounted.current || revision.current !== version) return;
      if (sendError) setError(mailError(sendError));
      else setMessage("등록된 계정이라면 비밀번호 설정 메일이 발송됩니다. 이 PC에서 메일의 링크를 열어 주세요. 메일이 없으면 스팸함도 확인해 주세요.");
    } catch (sendError) {
      if (mounted.current && revision.current === version) {
        setError(mailError(sendError));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const authorized = accessRef.current;
    if (submitting.current || saved || authorized.status !== "ready") return;
    setError(null);
    setMessage(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (password !== confirmation) {
      setError("두 비밀번호가 일치하지 않습니다.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    const version = revision.current;
    const accountIdentity = identity.current;
    const unchanged = () => mounted.current && identity.current === accountIdentity;
    try {
      const supabase = getSupabase();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!unchanged() || revision.current !== version) return;
      if (sessionError || sessionData.session?.user.id !== authorized.userId || sessionData.session?.user.email !== authorized.email) {
        setError("로그인 상태가 바뀌었습니다. 다시 확인한 뒤 비밀번호를 설정해 주세요.");
        accessRef.current = { status: "checking" };
        setAccess({ status: "checking" });
        setRetry((value) => value + 1);
        return;
      }
      // 제출 직전에도 병원을 재검증하며 다른 병원 계정의 암호를 바꾸지 않는다.
      const { data: clinic, error: clinicError } = await supabase.rpc("current_clinic");
      if (!unchanged() || revision.current !== version) return;
      const expected = clinicFromHostname(window.location.hostname);
      if (clinicError || (clinic !== "S" && clinic !== "N") || (expected && clinic !== expected)) {
        const blocked: Access = { status: "blocked", message: "계정의 병원 권한을 확인하지 못했습니다. 비밀번호는 변경하지 않았습니다. 다시 확인해 주세요." };
        accessRef.current = blocked;
        setAccess(blocked);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      // USER_UPDATED 이벤트는 같은 계정을 재검증할 수 있다. 계정이 바뀐 결과는 버린다.
      if (!unchanged()) return;
      if (updateError) {
        setError("비밀번호를 저장하지 못했습니다. 다른 비밀번호를 입력하거나 잠시 후 다시 시도해 주세요.");
      } else {
        setPassword("");
        setConfirmation("");
        setSaved(true);
      }
    } catch {
      if (unchanged()) setError("비밀번호를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-bold">접수실 비밀번호 설정</h1>
      <p className="text-sm text-stone-600">{expectedClinic ? CLINIC_TITLES[expectedClinic] : "다담 접수실"}</p>
      <p className="text-sm leading-6 text-stone-600">
        접수실 앱 전용 비밀번호입니다. 네이버·메일 계정 비밀번호와는 별개이므로 같은 비밀번호를 사용하지 마세요.
      </p>
      {linkError && <p role="alert" className="text-sm text-red-700">{linkError}</p>}
      {access.status === "checking" && <p role="status" className="text-sm text-stone-600">로그인과 병원 확인 중…</p>}
      {access.status === "blocked" && (
        <>
          <p role="alert" className="text-sm text-red-700">{access.message}</p>
          <p className="text-xs text-stone-500">로그아웃하거나 다른 병원의 로그인 상태를 변경하지 않습니다.</p>
          <button type="button" disabled={busy} onClick={() => setRetry((value) => value + 1)} className="rounded border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">다시 확인</button>
        </>
      )}
      {access.status === "signed-out" && (
        <>
          <p className="text-sm text-stone-600">기존 접수실 계정의 이메일로 비밀번호 설정 링크를 요청하세요. 새 계정은 생성되지 않습니다.</p>
          <form onSubmit={requestRecovery} className="space-y-4" aria-busy={busy}>
            <label className="block">
              <span className="text-sm text-stone-600">계정 이메일</span>
              <input type="email" name="email" autoComplete="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2 disabled:opacity-50" />
            </label>
            <button type="submit" disabled={busy} className="w-full rounded bg-stone-900 py-2 text-white disabled:opacity-50">{busy ? "메일 요청 중…" : "비밀번호 설정 메일 받기"}</button>
          </form>
          <a href="/login" className="block text-sm text-stone-700 underline">로그인으로 돌아가기</a>
        </>
      )}
      {access.status === "ready" && (
        saved ? (
          <>
            <p role="status" className="text-sm leading-6 text-stone-700">비밀번호를 저장했습니다. 다음부터 계정 이메일과 새 접수실 비밀번호로 로그인하세요. 이 PC의 로그인 상태는 유지됩니다.</p>
            <a href="/" className="block rounded bg-stone-900 px-3 py-2 text-center text-white">접수실 열기</a>
          </>
        ) : (
          <form onSubmit={savePassword} className="space-y-4" aria-busy={busy}>
            <label className="block">
              <span className="text-sm text-stone-600">계정 이메일</span>
              <input type="email" name="account-email" autoComplete="username" readOnly value={access.email} className="mt-1 w-full rounded border border-stone-300 bg-stone-100 px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">새 접수실 비밀번호 (8자 이상)</span>
              <input type="password" name="new-password" autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2 disabled:opacity-50" />
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">새 비밀번호 확인</span>
              <input type="password" name="confirm-password" autoComplete="new-password" minLength={8} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2 disabled:opacity-50" />
            </label>
            <button type="submit" disabled={busy} className="w-full rounded bg-stone-900 py-2 text-white disabled:opacity-50">{busy ? "저장 중…" : "비밀번호 저장"}</button>
          </form>
        )
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm leading-6 text-stone-700">{message}</p>}
      <p className="text-xs leading-5 text-stone-500">공용 PC에서는 사용 후 접수실에서 로그아웃하세요. 비밀번호나 메일의 설정 링크를 다른 사람에게 공유하지 마세요.</p>
    </main>
  );
}
