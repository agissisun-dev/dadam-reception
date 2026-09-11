"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function AppHeader({ email }: { email: string }) {
  const router = useRouter();

  async function logout() {
    await getSupabase().auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
      <Link href="/" className="text-lg font-bold">
        다담 접수실
      </Link>
      <nav className="flex items-center gap-2 text-sm">
        <Link href="/tasks/new" className="rounded bg-stone-900 px-3 py-1.5 text-white">
          업무 등록
        </Link>
        <Link href="/history" className="rounded border border-stone-300 px-3 py-1.5">
          지난 기록
        </Link>
        <span className="ml-2 text-stone-500">{email}</span>
        <button onClick={logout} className="rounded border border-stone-300 px-3 py-1.5">
          로그아웃
        </button>
      </nav>
    </header>
  );
}
