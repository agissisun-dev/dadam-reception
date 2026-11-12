"use client";

import { useState } from "react";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { smsAppHref } from "@/lib/smsRules";

const LINK = "rounded border border-[#16863b] bg-white px-3 py-1.5 text-sm font-bold text-[#0f3d23]";
const BTN = "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50";

/** 문자 발송 API가 아니라 병원폰의 문자 작성창만 연다. 실제 발송은 직원이 확인한다. */
export default function SmsAppLink({ phone, text, beforeOpen, disabled = false }: {
  phone: string | null | undefined;
  text: string;
  beforeOpen?: () => Promise<void>;
  disabled?: boolean;
}) {
  const [device] = useState<"android" | "ios" | "windows" | "other" | null>(() => {
    if (typeof navigator === "undefined") return null;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Windows/i.test(ua)) return "windows";
    return "other";
  });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!device || !phone || !text.trim()) return null;
  const href = smsAppHref(phone, text, device === "ios");
  if (!href) return null;
  const blocked = disabled || busy;
  async function guarded(action: () => void | Promise<void>) {
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      await beforeOpen?.();
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연락 가능 여부를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {device !== "other" && (
        <a href={blocked ? undefined : href} aria-disabled={blocked} tabIndex={blocked ? -1 : 0}
          className={LINK + (blocked ? " opacity-50" : "")}
          title="연결된 병원 휴대폰의 문자 작성창을 엽니다. 자동으로 발송하지 않습니다."
          onClick={(event) => {
            event.preventDefault();
            void guarded(() => { window.location.href = href; });
          }}>
          {device === "windows" ? "병원폰 문자창 열기" : "문자 앱으로 열기"}
        </a>
      )}
      {(device === "windows" || device === "other") && (
        <button type="button" className={BTN} disabled={blocked} title={formatPhone(normalizePhone(phone))} onClick={() => {
          void guarded(async () => {
            if (!navigator.clipboard) throw new Error("이 환경에서는 번호 복사를 지원하지 않습니다.");
            await navigator.clipboard.writeText(normalizePhone(phone));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}>
          {copied ? "번호 복사됨" : "번호 복사"}
        </button>
      )}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </>
  );
}
