import { getSupabase } from "./supabaseClient";
import type { SmsLog } from "./types";

/** 문자 발송 장부. 최근 것부터. */
export async function listSmsLogs(limit = 100): Promise<SmsLog[]> {
  const { data, error } = await getSupabase()
    .from("sms_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SmsLog[];
}
