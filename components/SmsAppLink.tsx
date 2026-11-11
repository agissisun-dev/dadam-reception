"use client";

import { useState } from "react";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { smsAppHref } from "@/lib/smsRules";

const LINK = "rounded border border-[#16863b] bg-white px-3 py-1.5 text-sm font-bold text-[#0f3d23]";
const BTN = "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm";

/**
 * 병원 휴대폰 번호로 문자를 보내는 길 (사용자 2026-11-11). 솔라피 대표번호(02)는 답장을 못 받아서,
 * 답이 필요한 문자는 병원 휴대폰으로 보낸다. 어느 길이든 **그 휴대폰의 번호로 나가고 답장도 그 휴대폰으로 온다.**
 *
 * - 휴대폰에서 앱을 열었을 때: [문자 앱으로 열기] — 문자 앱이 받는 번호·문구가 채워진 채로 열린다.
 * - 윈도우 PC: [PC 문자 창 열기] — 윈도우의 "휴대폰과 연결" 앱이 sms: 주소를 받아 병원 휴대폰으로 보내는 창을 연다
 *   (PC와 병원 휴대폰을 한 번 연결해 두어야 한다, docs/setup-pc-phone-sms.md). 문구가 안 채워지는 경우를 대비해 [번호 복사]도 같이.
 * - 그 밖의 PC: [번호 복사]만.
 */
export default function SmsAppLink({ phone, text }: { phone: string | null | undefined; text: string }) {
  const [device] = useState<"android" | "ios" | "windows" | "other" | null>(() => {
    if (typeof navigator === "undefined") return null;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Windows/i.test(ua)) return "windows";
    return "other";
  });
  const [copied, setCopied] = useState(false);
  if (!device || !phone || !text.trim()) return null;
  const href = smsAppHref(phone, text, device === "ios");
  if (!href) return null;

  if (device === "android" || device === "ios") {
    return (
      <a href={href} className={LINK}>
        문자 앱으로 열기
      </a>
    );
  }

  const copyNumber = () => {
    navigator.clipboard
      ?.writeText(normalizePhone(phone))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };
  return (
    <>
      {device === "windows" && (
        <a href={href} className={LINK} title="윈도우의 '휴대폰과 연결' 앱에서 병원 휴대폰 번호로 보내는 문자 창이 열립니다">
          PC 문자 창 열기
        </a>
      )}
      <button type="button" className={BTN} onClick={copyNumber} title={formatPhone(normalizePhone(phone))}>
        {copied ? "번호 복사됨" : "번호 복사"}
      </button>
    </>
  );
}
