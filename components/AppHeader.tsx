"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { clinicInfo, fetchCurrentClinic, forgetClinic, type ClinicCode } from "@/lib/clinic";

/**
 * 왼쪽 메뉴(2026-10-02 접수실 요청: 장부가 길어져 위 메뉴가 올라가 버려서).
 * 넓은 화면에서는 왼쪽에 고정, 좁은 화면(폰)에서는 위 가로 메뉴로.
 * 순서는 접수실이 정함: 오늘 장부 · 해피콜 · 환자 · 약장 · 업무 등록 · 문구 틀 · 지난 기록 · 현황 · 로그아웃.
 */
const MENU: { href: string; label: string }[] = [
  { href: "/ledger", label: "오늘 장부" },
  { href: "/brew", label: "약대장" },
  { href: "/happy-calls", label: "해피콜" },
  { href: "/patients", label: "환자" },
  { href: "/cabinet", label: "약장" },
  { href: "/tasks/new", label: "업무 등록" },
  { href: "/templates", label: "문구 틀" },
  { href: "/history", label: "지난 기록" },
  { href: "/stats", label: "현황" },
];

const MORE: { href: string; label: string }[] = [
  { href: "/weekly", label: "주간 관리" },
  { href: "/ledger/codes", label: "약어 표" },
];

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [clinic, setClinic] = useState<ClinicCode | null>(null);

  // 본문을 메뉴 폭만큼 오른쪽으로 민다 (넓은 화면에서만). 메뉴가 없는 화면(로그인)은 그대로.
  useEffect(() => {
    document.body.classList.add("md:pl-44");
    return () => document.body.classList.remove("md:pl-44");
  }, []);

  // 로그인한 계정의 병원 이름 (다담에스 / 노원다담)
  useEffect(() => {
    let active = true;
    fetchCurrentClinic().then((c) => {
      if (active) setClinic(c);
    });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    await getSupabase().auth.signOut();
    forgetClinic();
    router.replace("/login");
  }
  const info = clinic ? clinicInfo(clinic) : null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-44 flex-col border-r border-stone-200 bg-white md:flex">
        <Link href="/" className={`px-4 py-4 text-lg font-bold ${isActive("/") ? "text-[#16863b]" : ""}`}>
          다담 접수실
          <span className="block text-[11px] font-normal text-stone-500">첫 화면 · 달력</span>
          {info && (
            <span className="mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: info.bg, color: info.text, border: `1px solid ${info.color}` }}>
              {info.short}
            </span>
          )}
        </Link>
        <nav className="flex flex-col gap-0.5 px-2">
          {MENU.map((m) => {
            const active = isActive(m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`rounded px-3 py-2 text-sm ${active ? "bg-[#f0f7f3] font-bold text-[#0f3d23]" : "text-stone-800 hover:bg-stone-100"}`}
              >
                {m.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-stone-100 px-4 py-3 text-xs text-stone-500">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href} className={`hover:underline ${isActive(m.href) ? "font-bold text-[#0f3d23]" : ""}`}>
              {m.label}
            </Link>
          ))}
          <button onClick={logout} className="mt-2 w-fit rounded border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:bg-stone-50">
            로그아웃
          </button>
        </div>
      </aside>

      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-3 md:hidden">
        <Link href="/" className="text-lg font-bold">
          다담 접수실{info ? <span className="ml-2 text-xs font-normal" style={{ color: info.text }}>{info.short}</span> : null}
        </Link>
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          {[...MENU, ...MORE].map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`rounded px-2.5 py-1 ${isActive(m.href) ? "bg-[#16863b] text-white" : "border border-stone-300"}`}
            >
              {m.label}
            </Link>
          ))}
          <button onClick={logout} className="rounded border border-stone-300 px-2.5 py-1 text-stone-500">
            로그아웃
          </button>
        </nav>
      </header>
    </>
  );
}
