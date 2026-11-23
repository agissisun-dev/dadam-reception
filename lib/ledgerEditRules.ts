import type { LedgerEntryWithItems, LedgerItem } from './types';
import type { ParsedItem } from './ledgerRules';
export function editableNote(e: Pick<LedgerEntryWithItems,'note_raw'|'items'>): string {
 return e.note_raw || e.items.map(i=>i.raw).join(',');
}
export function previewNoteEdit(items: ParsedItem[], before: LedgerItem[]) {
 const used=new Set<number>();
 return items.map(item=>{
  const old=before.find(i=>!used.has(i.id)&&i.raw===item.raw);
  if(old) used.add(old.id);
  return {item,unchanged:!!old};
 });
}
