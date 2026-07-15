import { activeItemsSorted } from './menu';
import type { MenuItemView } from './types';

export const GRAPH_API_VERSION = 'v21.0';
export const WHATSAPP_LIST_MAX_ROWS = 10;
export const LIST_ROW_TITLE_MAX = 24;

export function buildTextPayload(to: string, body: string) {
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body } };
}

export function buildImagePayload(to: string, body: string, imageUrl: string) {
  return { messaging_product: 'whatsapp', to, type: 'image', image: { link: imageUrl, caption: body } };
}

export function buildListPayload(to: string, bodyText: string, buttonLabel: string, items: MenuItemView[]) {
  const active = activeItemsSorted(items);

  if (active.length > WHATSAPP_LIST_MAX_ROWS) {
    throw new Error(
      `WhatsApp lists allow at most ${WHATSAPP_LIST_MAX_ROWS} rows; got ${active.length}. ` +
        'Hide an item in the panel or introduce sub-menus.',
    );
  }

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: [
          { rows: active.map((i) => ({ id: i.id, title: i.label.slice(0, LIST_ROW_TITLE_MAX) })) },
        ],
      },
    },
  };
}

/** Fallback for clients that cannot render interactive lists. Composed only from
 *  editable data — no invented prose. */
export function buildNumberedTextPayload(to: string, bodyText: string, items: MenuItemView[]) {
  const active = activeItemsSorted(items);
  const lines = active.map((item, index) => `${index + 1} - ${item.label}`).join('\n');
  return buildTextPayload(to, `${bodyText}\n\n${lines}`);
}
