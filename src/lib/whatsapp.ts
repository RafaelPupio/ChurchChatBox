import crypto from 'node:crypto';
import { activeItemsSorted } from './menu';
import type { ChurchConfig, MenuItemView, Reply } from './types';

export const GRAPH_API_VERSION = 'v21.0';
export const WHATSAPP_LIST_MAX_ROWS = 10;
export const LIST_ROW_TITLE_MAX = 24;

/** Thrown by buildListPayload when more than WHATSAPP_LIST_MAX_ROWS items are active.
 *  This is a local, expected condition (distinct from a Graph API/network failure),
 *  so sendReply can catch it specifically and fall back to the numbered text. */
export class MenuTooLongError extends Error {}

/** Thrown by buildListPayload when there are zero active items. Meta requires
 *  interactive lists to carry 1–10 rows; a zero-row payload would 400 at Graph.
 *  Distinct from MenuTooLongError so sendReply can route each case to the right
 *  fallback (numbered text vs. plain body text). */
export class MenuEmptyError extends Error {}

export function buildTextPayload(to: string, body: string) {
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body } };
}

export function buildImagePayload(to: string, body: string, imageUrl: string) {
  return { messaging_product: 'whatsapp', to, type: 'image', image: { link: imageUrl, caption: body } };
}

/** Truncates a row title to at most LIST_ROW_TITLE_MAX UTF-16 code units without
 *  splitting a grapheme cluster (e.g. a surrogate-pair emoji or an emoji + variation
 *  selector). Menu labels in this project routinely start with an emoji, so a naive
 *  `.slice()` can cut a glyph in half and render a broken character in the chat. */
export function truncateRowTitle(label: string): string {
  if (label.length <= LIST_ROW_TITLE_MAX) return label;

  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
  let result = '';
  for (const { segment } of segmenter.segment(label)) {
    if (result.length + segment.length > LIST_ROW_TITLE_MAX) break;
    result += segment;
  }
  return result;
}

export function buildListPayload(to: string, bodyText: string, buttonLabel: string, items: MenuItemView[]) {
  const active = activeItemsSorted(items);

  if (active.length === 0) {
    throw new MenuEmptyError(
      'No active menu items; WhatsApp interactive lists require at least 1 row. ' +
        'Seed the menu or unhide an item in the panel.',
    );
  }

  if (active.length > WHATSAPP_LIST_MAX_ROWS) {
    throw new MenuTooLongError(
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
          { rows: active.map((i) => ({ id: i.id, title: truncateRowTitle(i.label) })) },
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

/** Sends a plain text message. The one non-menu entry point other code (e.g. the
 *  webhook's failure apology) should use instead of hand-rolling a fetch call —
 *  this is the only module allowed to talk to the Graph API, and going through
 *  `post()` guarantees a non-2xx response throws instead of failing silently. */
export async function sendText(creds: WhatsAppCredentials, to: string, body: string): Promise<void> {
  await post(creds, buildTextPayload(to, body));
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

  // Interactive list first; fall back for the two local, expected conditions where
  // Graph would otherwise 400: MenuTooLongError (>10 active items — send the
  // numbered text built from the same rows) and MenuEmptyError (0 active items —
  // send just the body text, since a numbered list of nothing is nonsensical).
  // Any other error — e.g. a Graph API failure from `post()` (bad token, rate
  // limit, network blip) — must NOT trigger a retry here. Retrying with the same
  // credentials would likely fail identically, would bury the real error behind a
  // misleading log, and could double-send if Meta already queued the first
  // message. Let it propagate; the webhook layer already catches errors and sends
  // the church's configured error_text to the member. Do not widen this catch back
  // to `Error`.
  try {
    await post(creds, buildListPayload(to, reply.bodyText, config.menuButtonLabel, items));
  } catch (error) {
    if (error instanceof MenuEmptyError) {
      console.error(
        'Menu has zero active items — sending body text only instead of an interactive list. ' +
          'Seed the menu or unhide an item in the panel.',
        error,
      );
      await post(creds, buildTextPayload(to, reply.bodyText));
      return;
    }
    if (!(error instanceof MenuTooLongError)) throw error;
    console.error('Menu exceeds the interactive list limit; sending numbered text instead', error);
    await post(creds, buildNumberedTextPayload(to, reply.bodyText, items));
  }
}
