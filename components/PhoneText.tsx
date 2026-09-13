"use client";

import { useState } from "react";
import { formatPhone, maskPhone } from "@/lib/phone";

/**
 * 연락처 표시. 기본은 가운데 가림, 누르면 전체.
 * revealed=true면 처음부터 전체 번호와 전화 걸기 링크를 보인다.
 */
export default function PhoneText({ phone, revealed = false }: { phone: string; revealed?: boolean }) {
  const [shown, setShown] = useState(revealed);
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="font-mono text-stone-700 underline decoration-dotted"
        title="눌러서 전체 보기"
      >
        {maskPhone(phone)}
      </button>
    );
  }
  return (
    <a href={`tel:${phone}`} className="font-mono text-stone-900 underline">
      {formatPhone(phone)}
    </a>
  );
}
