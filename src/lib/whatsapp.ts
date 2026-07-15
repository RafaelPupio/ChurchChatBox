import crypto from 'node:crypto';
import { activeItemsSorted } from './menu';
import type { ChurchConfig, MenuItemView, Reply } from './types';

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

/** Meta signs every webhook. Without this check, anyone who learns the URL could
 *  inject fake messages into the church's inbox. */
export function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const provided = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]+$/i.test(provided)) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');

  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

async function post(creds: WhatsAppCredentials, payload: object): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${creds.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Graph API ${response.status}: ${detail}`);
  }
}

export async function sendReply(
  creds: WhatsAppCredentials,
  to: string,
  reply: Reply,
  config: ChurchConfig,
  items: MenuItemView[],
): Promise<void> {
  if (reply.type === 'text') {
    await post(creds, buildTextPayload(to, reply.body));
    return;
  }

  if (reply.type === 'image') {
    await post(creds, buildImagePayload(to, reply.body, reply.imageUrl));
    return;
  }

  // Interactive list first; fall back to the numbered text built from the same rows.
  try {
    await post(creds, buildListPayload(to, reply.bodyText, config.menuButtonLabel, items));
  } catch (error) {
    console.error('List send failed, falling back to numbered text', error);
    await post(creds, buildNumberedTextPayload(to, reply.bodyText, items));
  }
}
