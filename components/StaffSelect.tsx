"use client";

import { STAFF_NAMES, type StaffName } from "@/lib/staff";

export default function StaffSelect({
  value,
  onChange,
}: {
  value: StaffName;
  onChange: (n: StaffName) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-stone-600">처리한 사람</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as StaffName)}
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
