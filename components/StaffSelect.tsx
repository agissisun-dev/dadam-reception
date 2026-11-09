"use client";

import { useId, useState } from "react";
import {
  STAFF_NAMES,
  STAFF_NAME_MAX_LENGTH,
  loadRecentStaff,
  normalizeStaffName,
  saveLastStaff,
  staffClinicFromBrowser,
  type StaffName,
} from "@/lib/staff";

type StaffSelectProps = {
  value: StaffName;
  onChange: (n: StaffName) => void;
};

function EditableStaffSelect({ value, onChange }: StaffSelectProps) {
  const id = useId();
  const [recent, setRecent] = useState(() => loadRecentStaff("N"));
  // Keep the raw draft separate so typing spaces/clearing never gives a parent an invalid name.
  const [draft, setDraft] = useState({ value, text: value });
  const text = draft.value === value ? draft.text : value;

  function commit(raw: string) {
    const name = normalizeStaffName(raw, "N");
    setDraft({ value: name, text: name });
    onChange(name);
    saveLastStaff(name, "N");
    setRecent(loadRecentStaff("N"));
  }

  return (
    <label className="block">
      <span id={`${id}-label`} className="text-sm text-stone-600">처리한 사람</span>
      <input
        type="text"
        value={text}
        list={`${id}-recent`}
        maxLength={STAFF_NAME_MAX_LENGTH}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        onChange={(e) => {
          const raw = e.target.value;
          const name = normalizeStaffName(raw, "N");
          setDraft({ value: name, text: raw });
          onChange(name);
          if (recent.includes(raw)) commit(raw);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
      />
      <datalist id={`${id}-recent`}>
        {recent.map((name) => <option key={name} value={name} />)}
      </datalist>
      <span id={`${id}-help`} className="mt-1 block text-xs text-stone-500">
        이름은 나중에 바꿔도 됩니다. 비워 두면 접수실로 기록됩니다. 최근 이름은 이 PC의 이 브라우저에만 기억되며, 다른 PC와 공유되는 직원 명단이 아닙니다.
      </span>
    </label>
  );
}

export default function StaffSelect({ value, onChange }: StaffSelectProps) {
  const [clinic] = useState(staffClinicFromBrowser);
  if (clinic === "N") return <EditableStaffSelect value={value} onChange={onChange} />;

  return (
    <label className="block">
      <span className="text-sm text-stone-600">처리한 사람</span>
      <select
        value={value}
        onChange={(e) => {
          const name = normalizeStaffName(e.target.value, "S");
          onChange(name);
          saveLastStaff(name, "S");
        }}
        className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
      >
        {STAFF_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
