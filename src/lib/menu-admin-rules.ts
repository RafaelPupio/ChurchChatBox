import { WHATSAPP_LIST_MAX_ROWS } from './whatsapp';

/** WhatsApp interactive lists cap at 10 rows. Never allow an 11th active item. */
export function canActivateAnotherItem(activeCount: number): boolean {
  return activeCount < WHATSAPP_LIST_MAX_ROWS;
}

/** Turn a drag/move-ordered id list into 1-indexed positions. */
export function positionsFromOrder(orderedIds: string[]): { id: string; position: number }[] {
  return orderedIds.map((id, index) => ({ id, position: index + 1 }));
}
