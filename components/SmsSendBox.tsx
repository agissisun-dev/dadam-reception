"use client";

import { useRef, useState } from "react";
import { formatPhone } from "@/lib/phone";
import { smsByteLength, smsType } from "@/lib/smsRules";

export type SmsRecipient = { label: string; phone: string };

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

/**
 * 문자 보내기 확인 상자. 받는 사람을 고르고 [보내기]를 누르면 onSend(번호)가 불린다.
 * 문구는 위쪽 문구 칸에서 고친 것을 그대로 쓴다.
 */
export default function SmsSendBox({
  recipients,
  text,
  busy,
  onSend,
  onCancel,
  beforeSend,
}: {
  recipients: SmsRecipient[];
  text: string;
  busy: boolean;
  onSend: (to: string, label: string) => void | Promise<void>;
  onCancel: () => void;
  beforeSend?: () => Promise<void>;
}) {
  const [idx, setIdx] = useState(0);
  const guard = useRef(false);
  const [checking, setChecking] = useState(false);
  const [guardError, setGuardError] = useState<string | null>(null);
  const r = recipients[idx] ?? recipients[0];
  const bytes = smsByteLength(text);
  const type = smsType(text);
  const empty = !text.trim() || bytes > 2000 || !r;
  const blocked = busy || checking;
  async function confirmSend() {
    if (guard.current || blocked || empty) return;
    guard.current = true;
    setChecking(true);
    setGuardError(null);
    try { await beforeSend?.(); await onSend(r.phone, r.label); }
    catch (e) { setGuardError(e instanceof Error ? e.message : "연락 가능 여부를 확인하지 못했습니다."); }
    finally { guard.current = false; setChecking(false); }
  }

  return (
    <div className="space-y-2 rounded border border-stone-200 bg-stone-50 p-3">
      <p className="text-sm">
        받는 사람: <span className="font-medium">{r?.label} {r ? formatPhone(r.phone) : "연락처 없음"}</span>
      </p>
      <p className="whitespace-pre-wrap rounded bg-white p-2 text-sm">{text}</p>
      <p className="text-xs text-stone-500">받는 사람과 위 문구를 확인한 뒤 보내기를 누르세요. 등록된 병원번호로 직접 발송 요청합니다.</p>
      {guardError && <p role="alert" className="text-xs text-red-700">{guardError}</p>}
      {recipients.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {recipients.map((x, i) => (
            <button
              key={x.phone + i}
              type="button"
              disabled={blocked}
              onClick={() => setIdx(i)}
              className={`rounded border px-3 py-1.5 text-sm ${
                i === idx ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
              }`}
            >
              {x.label} {formatPhone(x.phone)}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-stone-500">
        {type === "SMS" ? "짧은 문자(SMS)" : "긴 문자(LMS)"} · {bytes}바이트
      </p>
      <div className="flex gap-2">
        <button type="button" className={PRIMARY} disabled={blocked || empty} onClick={() => void confirmSend()}>
          {blocked ? "보내는 중…" : "보내기"}
        </button>
        <button type="button" className={BTN} disabled={blocked} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
