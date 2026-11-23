#!/usr/bin/env node
/* Native Node harness for app/patients/new/page.tsx. Run after npm ci. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repo, "app", "patients", "new", "page.tsx");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(`${source}\nexport { NewPatient };\n`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}

function nodes(node, predicate, output = []) {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return output;
  if (Array.isArray(node)) {
    node.forEach((child) => nodes(child, predicate, output));
    return output;
  }
  if (predicate(node)) output.push(node);
  nodes(node.props?.children, predicate, output);
  return output;
}

function app(api, searchPhone = "") {
  const slots = [];
  let hook = 0;
  const react = {
    Suspense: "Suspense",
    useState(initial) {
      const index = hook++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = hook++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() {},
  };
  const jsx = (type, props, key) => ({ type, props: { ...(props || {}), ...(key === undefined ? {} : { key }) } });
  const prescriptionForm = function PrescriptionForm() {};
  const require = (name) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "next/link") return { default: "Link" };
    if (name === "next/navigation") return { useSearchParams: () => ({ get: (key) => key === "phone" ? searchPhone : null }) };
    if (name === "@/components/AuthGate") return { default: "AuthGate" };
    if (name === "@/components/AppHeader") return { default: "AppHeader" };
    if (name === "@/components/PrescriptionForm") return { default: prescriptionForm };
    if (name === "@/lib/patients") return api;
    if (name === "@/lib/phone") return {
      normalizePhone: (value) => String(value).replace(/\D/g, ""),
      isValidPhone: (value) => /^\d{10,11}$/.test(String(value).replace(/\D/g, "")),
      formatPhone: (value) => String(value),
    };
    if (name === "@/lib/packs") return { DEFAULT_PER_DAY: 3 };
    if (name === "@/lib/conditions") return { CONDITIONS: [{ value: "general", label: "일반" }], conditionLabel: () => "일반" };
    if (name === "@/lib/sources") return { SOURCES: [{ value: "walkin", label: "내원" }], sourceHint: () => "" };
    if (name === "@/lib/dates") return { todayISO: () => "2026-11-09", addDays: () => "2026-11-12" };
    throw new Error(`unexpected module: ${name}`);
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require, console, Promise, setImmediate });
  const NewPatient = module.exports.NewPatient;
  let tree;
  const render = () => { hook = 0; tree = NewPatient(); return tree; };
  const findButton = (label) => {
    const found = nodes(tree, (n) => n.type === "button" && text(n).includes(label));
    assert(found.length === 1, `button not uniquely found: ${label}`);
    return found[0];
  };
  const input = (placeholder) => {
    const found = nodes(tree, (n) => n.type === "input" && n.props?.placeholder === placeholder);
    assert(found.length === 1, `input not found: ${placeholder}`);
    return found[0];
  };
  const check = async (phone) => {
    input("010-1234-5678").props.onChange({ target: { value: phone } });
    render();
    findButton("확인").props.onClick();
    await flush();
    render();
  };
  const setName = (name) => {
    input("홍길동").props.onChange({ target: { value: name } });
    render();
  };
  const patientOnly = () => findButton("환자만 등록").props.onClick();
  const prescription = () => {
    const found = nodes(tree, (n) => n.props?.submitLabel === "환자·처방 저장 후 다음 환자");
    assert(found.length === 1, "new-patient prescription form not found");
    return found[0].props.onSubmit;
  };
  return { render, check, setName, patientOnly, prescription, get tree() { return tree; } };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await test("patient-only registration creates identity without prescription", async () => {
  let creates = 0; let prescriptions = 0;
  const h = app({
    findPatientsByPhone: async () => [],
    createPatient: async (input) => { creates += 1; return { id: "patient-only", ...input }; },
    addPrescription: async () => { prescriptions += 1; },
  });
  h.render(); await h.check("01012345678"); h.setName("테스트 단독"); h.patientOnly(); await flush(); h.render();
  assert(creates === 1 && prescriptions === 0, "patient-only path must not add a prescription");
  assert(text(h.tree).includes("환자 정보만 저장되었습니다"), "patient-only success message missing");
});

await test("rapid same-page patient-only double click creates once", async () => {
  let creates = 0;
  const h = app({
    findPatientsByPhone: async () => [],
    createPatient: async (input) => { creates += 1; await flush(); return { id: "once", ...input }; },
    addPrescription: async () => { throw new Error("not expected"); },
  });
  h.render(); await h.check("01012345678"); h.setName("테스트 중복클릭");
  h.patientOnly(); h.patientOnly(); await flush(); h.render();
  assert(creates === 1, "saveInFlight did not coalesce rapid clicks");
});

await test("create failure keeps entered input and reports no success", async () => {
  const h = app({
    findPatientsByPhone: async () => [],
    createPatient: async () => { throw new Error("create failed"); },
    addPrescription: async () => {},
  });
  h.render(); await h.check("01012345678"); h.setName("테스트 실패유지"); h.patientOnly(); await flush(); h.render();
  assert(h.tree && nodes(h.tree, (n) => n.type === "input" && n.props?.placeholder === "홍길동")[0].props.value === "테스트 실패유지", "failed create cleared the name");
  assert(!text(h.tree).includes("저장되었습니다"), "failed create showed success");
  assert(text(h.tree).includes("create failed"), "create failure was not shown");
});

await test("same-name duplicate is blocked while a distinct family member is allowed", async () => {
  let creates = 0;
  const existing = { id: "existing", name: "테스트 가족", phone: "01012345678", condition: "general" };
  const h = app({
    findPatientsByPhone: async () => [existing],
    createPatient: async (input) => { creates += 1; return { id: `family-${creates}`, ...input }; },
    addPrescription: async () => {},
  });
  h.render(); await h.check("01012345678"); findFamily(h).props.onClick(); h.render(); h.setName("테스트 가족"); h.patientOnly(); await flush(); h.render();
  assert(creates === 0 && text(h.tree).includes("같은 연락처·같은 이름"), "same-name family duplicate was not blocked");
  h.setName("테스트 가족 둘째"); h.patientOnly(); await flush(); h.render();
  assert(creates === 1 && text(h.tree).includes("환자 정보만 저장되었습니다"), "different-name family member was not allowed");
});

await test("optional prescription creates patient and prescription", async () => {
  let creates = 0; let prescriptions = 0;
  const h = app({
    findPatientsByPhone: async () => [],
    createPatient: async (input) => { creates += 1; return { id: "with-rx", ...input }; },
    addPrescription: async () => { prescriptions += 1; },
  });
  h.render(); await h.check("01012345678"); h.setName("테스트 처방"); await h.prescription()({ receive_date: "2026-11-12" }); await flush(); h.render();
  assert(creates === 1 && prescriptions === 1, "optional prescription path did not save both records");
  assert(text(h.tree).includes("환자·처방 정보가 저장되었습니다"), "prescription success message missing");
});

await test("ambiguous prescription failure cannot be retried", async () => {
  let creates = 0; let prescriptions = 0;
  const h = app({
    findPatientsByPhone: async () => [],
    createPatient: async (input) => { creates += 1; return { id: "uncertain", ...input }; },
    addPrescription: async () => { prescriptions += 1; throw new Error("ambiguous add"); },
  });
  h.render(); await h.check("01012345678"); h.setName("테스트 불확실");
  await h.prescription()({ receive_date: "2026-11-12" }).catch(() => {}); await flush(); h.render();
  assert(text(h.tree).includes("처방 저장 완료를 확인할 수 없습니다"), "uncertain prescription warning missing");
  await h.prescription()({ receive_date: "2026-11-12" }).catch(() => {}); await flush(); h.render();
  assert(creates === 1 && prescriptions === 1, "ambiguous prescription was retried");
});

function findFamily(h) {
  const found = nodes(h.tree, (n) => n.type === "button" && text(n).includes("같은 번호로 다른 분 등록"));
  assert(found.length === 1, "family registration button not found");
  return found[0];
}

console.log(`RESULT ${passed}/6 cases passed`);
