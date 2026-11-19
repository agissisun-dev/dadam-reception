"use client";

import { useState } from "react";
import { checkLoginStorage, type LoginStorageCheckResult } from "@/lib/loginStorageCheck";

export default function LoginStorageCheck() {
  const [result, setResult] = useState<LoginStorageCheckResult | null>(null);

  function onCheck() {
    setResult(checkLoginStorage({
      href: window.location.href,
      now: new Date(),
      online: navigator.onLine,
      publicSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      getStorage: () => window.localStorage,
      randomId: () => window.crypto.randomUUID(),
    }));
  }

  return (
    <section aria-label="로그인 유지 점검" className="mt-6 border-t border-stone-200 pt-4 text-sm">
      <button type="button" onClick={onCheck} className="w-full rounded border border-stone-300 py-2 text-stone-900">
        로그인 유지 점검
      </button>
      <p className="mt-2 text-xs text-stone-600">
        버튼을 누를 때만 이 브라우저를 점검합니다. 로그인 상태를 바꾸거나 점검 결과를 전송하지 않습니다.
      </p>
      {result && (
        <div role="status" aria-live="polite" className="mt-3 space-y-3 rounded border border-stone-300 bg-stone-50 p-3">
          <h2 className="font-semibold">로그인 유지 점검 결과</h2>
          <dl className="space-y-2 text-xs">
            <div><dt className="font-medium">현재 주소 (추가 정보 제외)</dt><dd className="break-all">{result.address}</dd></div>
            <div><dt className="font-medium">점검 시각</dt><dd><time dateTime={result.checkedAt}>{result.checkedAt}</time> (UTC)</dd></div>
            <div><dt className="font-medium">브라우저의 인터넷 연결 표시</dt><dd>{result.online ? "연결됨" : "연결 안 됨"}</dd></div>
            <div><dt className="font-medium">이 브라우저에 임시 정보 저장 시험</dt><dd>{result.storageWritable === "possible" ? "가능" : "불가 (저장·읽기·삭제 시험을 마치지 못함)"}</dd></div>
            <div><dt className="font-medium">기본 로그인 저장 항목 유무</dt><dd>{result.authKeyPresent === "yes" ? "있음" : result.authKeyPresent === "no" ? "없음" : "확인 불가"}</dd></div>
          </dl>
          <p className="text-xs text-stone-600">
            이 결과는 로그인 유지나 로그인 정보의 유효함을 보장하지 않습니다. 게스트 창인지, 다른 브라우저 프로필인지도 이 점검으로는 알 수 없습니다.
          </p>
          <p className="text-xs text-stone-600">
            다음에 비밀번호를 다시 묻는 일이 생기면 이 버튼을 누른 뒤, 위 점검 결과 칸만 사진으로 보내 주세요. 이메일·비밀번호 입력칸이나 다른 화면은 사진에 넣지 마세요.
          </p>
        </div>
      )}
    </section>
  );
}
