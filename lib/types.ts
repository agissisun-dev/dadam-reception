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

/** 약장 품목. 약(medicine)·외용제(topical). */
export type CabinetKind = "medicine" | "topical";
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
