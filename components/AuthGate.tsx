"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

type Props = { children: (email: string) => ReactNode };

export default function AuthGate({ children }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
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
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const e = data.session?.user.email ?? null;
      if (!e) {
        router.replace("/login");
      } else {
        setEmail(e);
      }
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const e = session?.user.email ?? null;
      setEmail(e);
      if (!e) router.replace("/login");
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router, configError]);

  if (configError) {
    return (
      <main className="p-6 text-red-700">
        연결 설정 오류: {configError}
      </main>
    );
  }
  if (checking || !email) {
    return <main className="p-6 text-stone-500">로그인 확인 중…</main>;
  }
  return <>{children(email)}</>;
}
