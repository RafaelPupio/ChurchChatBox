import { WHATSAPP_LIST_MAX_ROWS } from './whatsapp';

/** WhatsApp interactive lists cap at 10 rows. Never allow an 11th active item. */
export function canActivateAnotherItem(activeCount: number): boolean {
  return activeCount < WHATSAPP_LIST_MAX_ROWS;
}

/** Turn a drag/move-ordered id list into 1-indexed positions. */
export function positionsFromOrder(orderedIds: string[]): { id: string; position: number }[] {
  return orderedIds.map((id, index) => ({ id, position: index + 1 }));
}

/** Hiding the LAST visible item leaves the menu with zero rows. buildListPayload
 *  then throws MenuEmptyError, and sendReply's fallback sends the menu's body
 *  text with nothing to tap — a bot not broken enough to notice and not working
 *  enough to use. setItemActive gated activation on the 10-row cap and gated
 *  deactivation on nothing at all, and the old header paragraph on /admin/conteudo
 *  cheerfully taught a one-item church to press exactly that button. */
export function canHideItem(activeCount: number): boolean {
  return activeCount > 1;
}
