"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import { listCabinetItems } from "@/lib/cabinet";
import { listCodes, upsertCode } from "@/lib/ledger";
import { GROUP_LABEL, GROUP_ORDER, chipClass } from "@/lib/ledgerRules";
import type { CabinetItem, DecoctionKind, LedgerCode, LedgerGroup } from "@/lib/types";

const SEL = "h-8 rounded border border-stone-300 px-1.5 text-sm";
const INP = "h-8 rounded border border-stone-300 px-2 text-sm";

function Row({ c, cabinetItems, onSaved }: { c: LedgerCode; cabinetItems: CabinetItem[]; onSaved: () => void }) {
  const [name, setName] = useState(c.name);
  const [group, setGroup] = useState<LedgerGroup>(c.group);
  const [cabinetId, setCabinetId] = useState<number | "">(c.cabinet_item_id ?? "");
  const [kind, setKind] = useState<DecoctionKind>(c.decoction_kind ?? "general");
  const [active, setActive] = useState(c.active);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    name !== c.name || group !== c.group || active !== c.active ||
    (group === "cabinet" && (cabinetId === "" ? null : Number(cabinetId)) !== c.cabinet_item_id) ||
    (group === "decoction" && kind !== c.decoction_kind);

  async function save() {
    setError(null);
    try {
      await upsertCode({
        id: c.id, code: c.code, name, group,
        cabinet_item_id: group === "cabinet" && cabinetId !== "" ? Number(cabinetId) : null,
        decoction_kind: group === "decoction" ? kind : null,
        active, sort_order: c.sort_order,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <li className={`flex flex-wrap items-center gap-2 py-2 ${active ? "" : "opacity-50"}`}>
      <span className={`w-28 rounded-full border px-2.5 py-0.5 text-center text-xs ${chipClass(group)}`}>{c.code}</span>
      <input value={name} onChange={(e) => setName(e.target.value)} className={`${INP} w-36`} />
      <select value={group} onChange={(e) => setGroup(e.target.value as LedgerGroup)} className={SEL}>
        {GROUP_ORDER.map((g) => (
          <option key={g} value={g}>{GROUP_LABEL[g]}</option>
        ))}
      </select>
      {group === "cabinet" && (
        <select value={cabinetId} onChange={(e) => setCabinetId(e.target.value === "" ? "" : Number(e.target.value))} className={SEL}>
          <option value="">약장 품목 (연결 안 함)</option>
          {cabinetItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      )}
      {group === "decoction" && (
        <select value={kind} onChange={(e) => setKind(e.target.value as DecoctionKind)} className={SEL}>
          <option value="insurance">보험 탕약</option>
          <option value="general">일반 탕약</option>
          <option value="fermented">발효 탕약</option>
        </select>
      )}
      <label className="flex items-center gap-1 text-xs text-stone-600">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 사용 중
      </label>
      {dirty && (
        <button type="button" onClick={save} className="rounded bg-stone-900 px-3 py-1 text-xs text-white">저장</button>
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </li>
  );
}

function Codes() {
  const [codes, setCodes] = useState<LedgerCode[]>([]);
  const [cabinetItems, setCabinetItems] = useState<CabinetItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<LedgerGroup>("treatment");
  const [newCabinet, setNewCabinet] = useState<number | "">("");
  const [newKind, setNewKind] = useState<DecoctionKind>("general");

  const load = useCallback(() => {
    Promise.all([listCodes(true), listCabinetItems()])
      .then(([c, i]) => {
        setCodes(c);
        setCabinetItems(i);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setError(null);
    try {
      await upsertCode({
        code: newCode, name: newName || newCode, group: newGroup,
        cabinet_item_id: newGroup === "cabinet" && newCabinet !== "" ? Number(newCabinet) : null,
        decoction_kind: newGroup === "decoction" ? newKind : null,
        active: true, sort_order: 50,
      });
      setNewCode("");
      setNewName("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">약어 표</h1>
        <Link href="/ledger" className="text-sm text-stone-500 underline">오늘 장부로</Link>
      </div>
      <p className="text-sm text-stone-600">
        기타 칸에 치는 약어와 그 뜻입니다. 묶음에 따라 앱이 하는 일이 다릅니다. <b>탕약</b>은 처방·해피콜을 만들고, <b>약장 품목</b>은 약장 나감을 남기고, 치료·엑스제·기타는 세기만 합니다.
        안 쓰는 약어는 지우지 말고 &ldquo;사용 중&rdquo;을 끄세요. 괄호 숫자는 만원 금액, 숫자+T는 개수, #2는 2회 분할 수령으로 읽습니다.
      </p>
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <section className="rounded-lg border border-stone-200 bg-white p-3">
        <h2 className="mb-1 text-sm font-bold">새 약어</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="약어 (치는 글자)" className={`${INP} w-28`} />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" className={`${INP} w-36`} />
          <select value={newGroup} onChange={(e) => setNewGroup(e.target.value as LedgerGroup)} className={SEL}>
            {GROUP_ORDER.map((g) => (
              <option key={g} value={g}>{GROUP_LABEL[g]}</option>
            ))}
          </select>
          {newGroup === "cabinet" && (
            <select value={newCabinet} onChange={(e) => setNewCabinet(e.target.value === "" ? "" : Number(e.target.value))} className={SEL}>
              <option value="">약장 품목 (연결 안 함)</option>
              {cabinetItems.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          )}
          {newGroup === "decoction" && (
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as DecoctionKind)} className={SEL}>
              <option value="insurance">보험 탕약</option>
              <option value="general">일반 탕약</option>
              <option value="fermented">발효 탕약</option>
            </select>
          )}
          <button type="button" onClick={add} disabled={!newCode.trim()} className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">추가</button>
        </div>
      </section>

      {GROUP_ORDER.map((g) => {
        const list = codes.filter((c) => c.group === g);
        if (list.length === 0) return null;
        return (
          <section key={g} className="rounded-lg border border-stone-200 bg-white p-3">
            <h2 className="text-sm font-bold">{GROUP_LABEL[g]} ({list.length})</h2>
            <ul className="divide-y divide-stone-100">
              {list.map((c) => (
                <Row key={`${c.id}-${c.name}-${c.group}-${c.cabinet_item_id}-${c.active}`} c={c} cabinetItems={cabinetItems} onSaved={load} />
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

export default function LedgerCodesPage() {
  return (
    <AuthGate>
      {() => (
        <>
          <AppHeader />
          <Codes />
        </>
      )}
    </AuthGate>
  );
}
