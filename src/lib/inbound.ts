import type { InboundMessage } from './types';

export interface ParsedInbound {
  phoneNumberId: string;
  waMessageId: string;
  from: string;
  name: string | null;
  message: InboundMessage;
}

/** Defensive parsing of Meta's envelope. Returns null for anything that is not a
 *  member message (delivery receipts, malformed bodies). */
export function parseInbound(payload: unknown): ParsedInbound | null {
  const value = (payload as any)?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return null;

  const phoneNumberId = value.metadata?.phone_number_id;
  const raw = value.messages?.[0];
  if (!phoneNumberId || !raw?.id || !raw?.from) return null;

  const name = value.contacts?.[0]?.profile?.name ?? null;

  let message: InboundMessage;
  if (raw.type === 'text' && typeof raw.text?.body === 'string') {
    message = { kind: 'text', text: raw.text.body };
  } else if (raw.type === 'interactive' && raw.interactive?.type === 'list_reply' && raw.interactive.list_reply?.id) {
    message = { kind: 'list_reply', itemId: raw.interactive.list_reply.id };
  } else {
    message = { kind: 'unsupported' };
  }

  return { phoneNumberId, waMessageId: raw.id, from: raw.from, name, message };
}
