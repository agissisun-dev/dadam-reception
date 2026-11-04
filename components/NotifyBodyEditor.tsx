"use client";

import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/appointments";
import { dateKo, fillTemplate } from "@/lib/appointmentRules";
import { clinicInfo, fetchCurrentClinic } from "@/lib/clinic";
import { todayISO } from "@/lib/dates";

const BTN = "rounded border border-stone-300 px-3 py-1.5 text-sm";
const PRIMARY = "rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50";

/**
 * 예약 안내 문구 고치기. 예약 화면과 문구 틀 화면 양쪽에서 같은 글을 고친다(샘들이 어디서든 바꿀 수 있게, 사용자 2026-11-04).
 * 자리표 {이름} {병원} {날짜} {시간}은 예약이 잡힐 때 채워진다.
 */
export default function NotifyBodyEditor({ initial, onSaved, onClose }: { initial?: string; onSaved?: (body: string) => void; onClose?: () => void }) {
  const [body, setBody] = useState(initial ?? "");
  const [loaded, setLoaded] = useState(initial !== undefined);
  const [clinicName, setClinicName] = useState("다담에스한의원");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (initial === undefined) {
      getSettings()
        .then((s) => {
          setBody(s.notify_body);
          setLoaded(true);
        })
        .catch((e: Error) => setError(e.message));
    }
    fetchCurrentClinic()
      .then((c) => c && setClinicName(clinicInfo(c).name))
      .catch(() => undefined);
  }, [initial]);

  const preview = fillTemplate(body, { 이름: "홍길동", 병원: clinicName, 날짜: dateKo(todayISO()), 시간: "10:30" });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ notify_body: body });
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      onSaved?.(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b>예약 안내 문구</b>
        <span className="text-[11px] text-stone-500">자리표 {"{이름} {병원} {날짜} {시간}"} 은 예약이 잡힐 때 그 환자 것으로 채워집니다.</span>
      </div>
      {!loaded ? (
        <p className="mt-2 text-xs text-stone-500">불러오는 중…</p>
      ) : (
        <>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-2 w-full rounded border border-stone-300 px-2 py-1 text-sm" />
          <p className="mt-1 text-[11px] text-stone-500">미리 보기</p>
          <p className="whitespace-pre-wrap rounded bg-stone-50 px-3 py-2 text-xs">{preview}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={PRIMARY} disabled={busy} onClick={save}>저장</button>
            {onClose && <button type="button" className={BTN} onClick={onClose}>닫기</button>}
            {savedAt && <span className="text-xs text-[#0f3d23]">저장했습니다 ({savedAt}). 다음 예약부터 이 글로 나옵니다.</span>}
          </div>
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </section>
  );
}
