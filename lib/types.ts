export type TaskStatus = "todo" | "done";

export type Task = {
  id: number;
  title: string;
  due_date: string; // YYYY-MM-DD
  guide_text: string;
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  completion_memo: string | null;
  created_at: string;
};

export type TaskInput = {
  title: string;
  due_date: string;
  guide_text: string;
};

export type Condition = "digestive" | "skin" | "general";

export type Patient = {
  id: number;
  name: string;
  phone: string;
  family_phone: string | null;
  family_note: string | null;
  condition: Condition;
  memo: string | null;
  excluded_at: string | null;
  excluded_reason: string | null;
  weekly_status: WeeklyStatus;
  weekly_weekday: number;
  weekly_interval: number;
  weekly_round: number;
  weekly_next_date: string | null;
  weekly_started_at: string | null;
  created_at: string;
};

export type Prescription = {
  id: number;
  patient_id: number;
  receive_date: string;
  days: number;
  packs: number | null;
  per_day: number | null;
  memo: string | null;
  status: "active" | "closed";
  created_at: string;
};

export type HappyCall = {
  id: number;
  prescription_id: number;
  round: 1 | 2;
  due_date: string;
  auto_due_date: string;
  note: string;
  status: "pending" | "contacted" | "closed";
  missed_count: number;
  created_at: string;
};

export type ContactAction = "contacted" | "missed" | "represcribed" | "excluded" | "rescheduled";
export type ContactChannel = "phone" | "kakao" | "sms";

export type ContactLog = {
  id: number;
  happy_call_id: number;
  action: ContactAction;
  channel: ContactChannel | null;
  memo: string | null;
  staff_name: string;
  created_at: string;
};

/** 명단 한 줄: 해피콜 + 처방 + 환자, 그리고 이 환자의 몇 번째 처방인지 */
export type HappyCallRow = HappyCall & {
  prescription: Prescription & { patient: Patient };
  prescription_seq: number;
};

export type PatientInput = {
  name: string;
  phone: string;
  family_phone: string;
  family_note: string;
  condition: Condition;
  memo: string;
};

export type PrescriptionInput = {
  receive_date: string;
  days: number;
  packs: number | null;
  per_day: number | null;
  memo: string;
};

export type TemplateKind = "task" | "weekly";

export type Template = {
  id: number;
  kind: TemplateKind;
  name: string;
  title: string | null;
  body: string;
  date_rule: string | null;
  condition: Condition | null;
  round: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TemplateInput = Omit<Template, "id" | "created_at" | "updated_at">;

export type WeeklyStatus = "off" | "active" | "dormant";
export type WeeklyAction = "sent" | "skipped_visited" | "no_reply" | "dormant" | "excluded";
export type ReplyStatus = "none" | "waiting_doctor" | "reviewed";

export type WeeklyContact = {
  id: number;
  patient_id: number;
  round: number;
  planned_date: string;
  action: WeeklyAction;
  message: string | null;
  patient_reply: string | null;
  reply_status: ReplyStatus;
  doctor_note: string | null;
  staff_name: string;
  created_at: string;
};

/** 주간 관리 명단 한 줄 */
export type WeeklyRow = Patient & {
  last: WeeklyContact | null;
  lastReviewed: WeeklyContact | null;
  noReplyStreak: number;
};

/** 문자 발송 장부 한 줄. 서버가 성공·실패 모두 남긴다. */
export type SmsLog = {
  id: number;
  patient_id: number | null;
  patient_name: string;
  recipient_label: string;
  to_phone: string;
  text: string;
  sms_type: "SMS" | "LMS";
  staff_name: string;
  ok: boolean;
  error: string | null;
  message_id: string | null;
  created_at: string;
};

/** 약장 품목. 약(medicine)·외용제(topical)·용품(supply: 핫팩·한방파스 등). */
export type CabinetKind = "medicine" | "topical" | "supply";
export type CabinetItem = {
  id: number;
  name: string;
  kind: CabinetKind;
  min_stock: number;
  active: boolean;
  sort_order: number;
  created_at: string;
};
export type CabinetItemInput = Omit<CabinetItem, "id" | "created_at">;

/** 약장 장부 한 줄. 넣기만 가능, 앱에서 수정·삭제 불가. */
export type CabinetMoveKind = "in" | "out" | "count" | "discard";
/** 나감 사유: 판매 · 리뷰 증정 · 서비스 · 기타 */
export type CabinetPurpose = "sale" | "review" | "service" | "other";
export type CabinetMove = {
  id: number;
  item_id: number;
  kind: CabinetMoveKind;
  qty: number;
  expiry: string | null;
  purpose: CabinetPurpose | null;
  patient_id: number | null;
  patient_name: string | null;
  staff_name: string;
  memo: string | null;
  diff: number | null;
  created_at: string;
};

/** 처리가 끝난 해피콜 + 마지막 처리 기록(달력 완료 표시용). prescription_seq는 여기선 안 쓴다(0). */
export type HandledHappyCall = HappyCallRow & { last: ContactLog | null };

/** 주간 관리 기록 + 환자 이름(달력 완료 표시용) */
export type WeeklyContactWithName = WeeklyContact & { patient: { name: string } | null };

/** 수납 장부 (V4). 약어 묶음: 탕약·약장 품목·치료·엑스제·기타 */
export type LedgerGroup = "decoction" | "cabinet" | "treatment" | "extract" | "other";
export type DecoctionKind = "insurance" | "general" | "fermented";
export type LedgerCode = {
  id: number;
  code: string;
  name: string;
  group: LedgerGroup;
  cabinet_item_id: number | null;
  decoction_kind: DecoctionKind | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};
export type LedgerCodeInput = Omit<LedgerCode, "id" | "created_at">;
export type LedgerDay = { day: string; closed_at: string | null; closed_by: string | null; memo: string | null };
export type LedgerEntry = {
  id: number;
  day: string;
  seq: number;
  patient_id: number | null;
  patient_name: string;
  insurance_kind: string | null;
  cash: number;
  cash_receipt: number;
  card: number;
  note_raw: string;
  memo: string | null;
  staff_name: string;
  kind: "normal" | "correction";
  corrects_id: number | null;
  correction_reason: string | null;
  packs_missing: boolean;
  /** 합계에서 빼기(붉은 금액): 제로페이·서울페이·계좌입금처럼 접수실에 돈이 없는 줄 */
  off_total: boolean;
  pay_note: string | null;
  created_at: string;
  updated_at: string;
};
export type LedgerItem = {
  id: number;
  entry_id: number;
  code: string;
  name: string;
  group: LedgerGroup;
  qty: number;
  amount: number | null;
  days: number | null;
  split: number | null;
  raw: string;
  prescription_id: number | null;
  cabinet_move_id: number | null;
  created_at: string;
};
/** 줄 + 항목 + (처방이 있으면) 해피콜 날짜 */
export type LedgerEntryWithItems = LedgerEntry & {
  items: LedgerItem[];
  prescriptions: { id: number; happy_calls: { round: number; due_date: string; status: string }[] }[];
};
export type LedgerExpense = { id: number; day: string; title: string; amount: number; staff_name: string; created_at: string };

/** 약대장 (V5). 한 칸 = 탕전 일정 하나 */
export type BrewKind = "decoction" | "ferment_start" | "ferment_end" | "batch" | "note";
export type BrewJob = {
  id: number;
  day: string | null; // 달이는 날, null = 날짜 미정
  slot: "am" | "pm";
  kind: BrewKind;
  patient_id: number | null;
  patient_name: string;
  title: string;
  delivery: "pickup" | "courier" | null;
  region: string | null;
  pouch: string | null;
  split_no: number | null;
  split_of: number | null;
  memo: string | null;
  max_jobs: number | null;
  status: "planned" | "done";
  done_at: string | null;
  done_by: string | null;
  receive_day: string | null;
  prescription_id: number | null;
  ledger_entry_id: number | null;
  pair_id: number | null;
  sort_order: number;
  staff_name: string;
  created_at: string;
  updated_at: string;
};
export type BrewWeekdayRule = { weekday: number; note: string; max_jobs: number };
