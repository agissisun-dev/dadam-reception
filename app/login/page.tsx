"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("이메일 또는 비밀번호가 맞지 않습니다.");
      return;
    }
    router.replace("/");
  }

  return (
    <main className="mx-auto mt-16 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-bold">다담 접수실</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-stone-600">이메일</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">비밀번호</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-stone-900 py-2 text-white disabled:opacity-50"
        >
          {busy ? "확인 중…" : "로그인"}
        </button>
      </form>
      <p className="mt-6 text-xs text-stone-500">
        계정은 원장님이 만들어 드립니다. 가입 화면은 없습니다.
      </p>
    </main>
  );
}
