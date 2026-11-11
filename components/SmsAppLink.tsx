"use client";

import { useState } from "react";
import { smsAppHref } from "@/lib/smsRules";

/**
 * [문자 앱으로 열기] — 휴대폰에서 앱을 열었을 때만 보인다.
 * 누르면 그 휴대폰의 문자 앱이 받는 번호·문구가 채워진 채로 열리고, 샘은 읽어 보고 전송만 누른다.
 * **그 휴대폰의 번호로 나간다**(대표번호가 아님). 병원 휴대폰에서 써야 답장이 병원으로 온다(사용자 2026-11-11).
 * PC에서는 문자 앱이 없으니 감춘다 — 거기서는 [복사]나 [문자 보내기]를 쓴다.
 */
export default function SmsAppLink({ phone, text, className }: { phone: string | null | undefined; text: string; className?: string }) {
  const [device] = useState<"android" | "ios" | null>(() => {
    if (typeof navigator === "undefined") return null;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return null;
  });
  if (!device || !phone || !text.trim()) return null;
  const href = smsAppHref(phone, text, device === "ios");
  if (!href) return null;
  return (
    <a href={href} className={className ?? "rounded border border-[#16863b] bg-white px-3 py-1.5 text-sm font-bold text-[#0f3d23]"}>
      문자 앱으로 열기
    </a>
  );
}
