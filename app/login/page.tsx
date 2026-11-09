"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabaseClient";
import { clinicInfo, type ClinicCode } from "@/lib/clinic";
import { CLINIC_TITLES, clinicFromHostname } from "@/lib/clinicHosts";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [expectedClinic, setExpectedClinic] = useState<ClinicCode | null>(null);

  useEffect(() => {
    let active = true;
    let navigating = false;
    const goHome = () => {
      if (active && !navigating) {
        navigating = true;
        router.replace("/");
      }
    };
    const expected = clinicFromHostname(window.location.hostname);

    async function checkSession() {
      try {
        const { data, error } = await getSupabase().auth.getSession();
        if (!active) return;
        if (!error && data.session) {
          goHome();
          return;
        }
      } catch {
        // 세션 확인에 실패해도 로그인 화면을 사용할 수 있게 한다.
      }
      if (active) {
        setExpectedClinic(expected);
        setCheckingSession(false);
      }
    }

    const { data: listener } = getSupabase().auth.onAuthStateChange((_event, session) => {
      if (session) goHome();
    });
    void checkSession();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!checkingSession) {
      document.title = expectedClinic ? CLINIC_TITLES[expectedClinic] : "다담 접수실";
    }
  }, [checkingSession, expectedClinic]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError("이메일 또는 비밀번호가 맞지 않습니다.");
        return;
      }
      router.replace("/");
    } catch {
      setError("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function onEmailLink() {
    setError(null);
    setMessage(null);
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL("/", window.location.origin).href,
        },
      });
      if (error) {
        setError(error.status === 429 || error.code === "over_email_send_rate_limit"
          ? "인증메일 발송 한도에 도달했습니다. 반복 요청하지 말고 잠시 후 다시 시도해 주세요."
          : "로그인 링크를 보내지 못했습니다. 이메일을 확인하고 다시 시도해 주세요.");
        return;
      }
      setMessage("로그인 링크를 보냈습니다. 이 PC에서 메일의 링크를 열어 주세요.");
    } catch {
      setError("로그인 링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="mx-auto mt-16 max-w-sm p-6">
        <p role="status" className="text-sm text-stone-600">
          로그인 상태 확인 중…
        </p>
      </main>
    );
  }

  const info = expectedClinic ? clinicInfo(expectedClinic) : null;
  const isNowon = expectedClinic === "N";

  return (
    <main className="mx-auto mt-16 max-w-sm p-6">
      <h1 className="mb-2 text-2xl font-bold">{expectedClinic ? CLINIC_TITLES[expectedClinic] : "다담 접수실"}</h1>
      {info && (
        <span className="mb-3 inline-block rounded px-2 py-1 text-xs font-bold" style={{ background: info.bg, color: info.text, border: `1px solid ${info.color}` }}>
          {info.short}
        </span>
      )}
      <p className="mb-6 text-sm text-stone-600">
        {expectedClinic
          ? isNowon
            ? "접수실 전용 비밀번호로 로그인합니다. 처음 사용하시면 아래에서 비밀번호를 설정해 주세요. 네이버 비밀번호와는 별개입니다."
            : `${CLINIC_TITLES[expectedClinic]} 계정으로 로그인해 주세요. 다른 병원 주소와 로그인 상태가 따로 유지됩니다.`
          : "병원 계정으로 로그인해 주세요. 이 주소에는 병원이 고정되어 있지 않습니다."}
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-stone-600">이메일</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">{isNowon ? "접수실 비밀번호" : "비밀번호"}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-stone-600">{message}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-stone-900 py-2 text-white disabled:opacity-50"
        >
          {busy ? "확인 중…" : "로그인"}
        </button>
        {!isNowon && (
          <button type="button" onClick={onEmailLink} disabled={busy} className="w-full rounded border border-stone-300 py-2 text-stone-900 disabled:opacity-50">
            이메일로 로그인 링크 받기
          </button>
        )}
      </form>
      {isNowon && (
        <Link href="/account/password" className="mt-4 block text-center text-sm font-medium text-blue-700 underline">
          처음 비밀번호 설정 · 비밀번호 재설정
        </Link>
      )}
      <p className="mt-6 text-xs text-stone-500">
        계정은 원장님이 만들어 드립니다. 가입 화면은 없습니다.
      </p>
      <p className="mt-2 text-xs text-stone-500">
        이 PC에서는 로그아웃하기 전까지 로그인 상태가 유지됩니다.
        외부·공용 PC에서는 사용 후 반드시 로그아웃하세요.
      </p>
    </main>
  );
}
