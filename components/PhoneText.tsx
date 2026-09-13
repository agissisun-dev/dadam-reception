"use client";

import { useState } from "react";
import { formatPhone, maskPhone } from "@/lib/phone";

export default function PhoneText({ phone }: { phone: string }) {
  const [shown, setShown] = useState(false);
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
