"use client";

import { useState } from "react";
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
}: {
  recipients: SmsRecipient[];
  text: string;
  busy: boolean;
  onSend: (to: string, label: string) => void;
  onCancel: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const r = recipients[idx] ?? recipients[0];
  const bytes = smsByteLength(text);
  const type = smsType(text);
  const empty = !text.trim();

  return (
    <div className="space-y-2 rounded border border-stone-200 bg-stone-50 p-3">
      <p className="text-sm">
        위 문구를 <span className="font-medium">{r.label} {formatPhone(r.phone)}</span> 번호로 문자 보냅니다.
      </p>
      {recipients.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {recipients.map((x, i) => (
            <button
              key={x.phone + i}
              type="button"
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
        <button type="button" className={PRIMARY} disabled={busy || empty} onClick={() => onSend(r.phone, r.label)}>
          {busy ? "보내는 중…" : "보내기"}
        </button>
        <button type="button" className={BTN} disabled={busy} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
