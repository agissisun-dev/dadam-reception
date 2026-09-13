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
  created_at: string;
};

export type Prescription = {
  id: number;
  patient_id: number;
  receive_date: string;
  days: number;
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
  memo: string;
};
