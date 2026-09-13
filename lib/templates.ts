import { getSupabase } from "./supabaseClient";
import type { Template, TemplateInput, TemplateKind } from "./types";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

export async function listTemplates(kind?: TemplateKind): Promise<Template[]> {
  let q = getSupabase().from("templates").select("*").order("sort_order").order("id");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) fail("문구 틀 목록", error.message);
  return (data ?? []) as Template[];
}

export async function createTemplate(input: TemplateInput): Promise<Template> {
  const { data, error } = await getSupabase().from("templates").insert(input).select("*").single();
  if (error) fail("문구 틀 추가", error.message);
  return data as Template;
}

export async function updateTemplate(id: number, input: Partial<TemplateInput>): Promise<Template> {
  const { data, error } = await getSupabase()
    .from("templates")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail("문구 틀 수정", error.message);
  return data as Template;
}

export async function deleteTemplate(id: number): Promise<void> {
  const { error } = await getSupabase().from("templates").delete().eq("id", id);
  if (error) fail("문구 틀 삭제", error.message);
}
