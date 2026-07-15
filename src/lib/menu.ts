import type { MenuItemView } from './types';

/** The single definition of "what is in the menu" — used by the router and the
 *  WhatsApp renderer so the tappable list and the numbered fallback cannot drift. */
export function activeItemsSorted(items: MenuItemView[]): MenuItemView[] {
  return items.filter((i) => i.isActive).sort((a, b) => a.position - b.position);
}
