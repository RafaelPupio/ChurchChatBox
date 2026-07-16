import { db } from '@/db/client';
import { message } from '@/db/schema';

/** Returns false when this wa_message_id was already stored — i.e. Meta re-delivered
 *  it and the caller must not reply again. */
export async function recordInboundMessage(args: {
  churchId: string;
  contactId: string;
  waMessageId: string;
  body: string | null;
}): Promise<boolean> {
  const inserted = await db
    .insert(message)
    .values({
      churchId: args.churchId,
      contactId: args.contactId,
      waMessageId: args.waMessageId,
      direction: 'inbound',
      body: args.body,
    })
    .onConflictDoNothing({ target: message.waMessageId })
    .returning({ id: message.id });

  return inserted.length > 0;
}

export async function recordOutboundMessage(args: {
  churchId: string;
  contactId: string;
  body: string | null;
}): Promise<void> {
  await db.insert(message).values({
    churchId: args.churchId,
    contactId: args.contactId,
    direction: 'outbound',
    body: args.body,
  });
}
