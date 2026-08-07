import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, message } from '@/db/schema';
import type { ContactRecord } from '@/lib/repo/contact';
import type { ContactMode } from '@/lib/types';

export type MessageRecord = typeof message.$inferSelect;

/** All of the church's contacts, most-recently-active first.
 *  NULLS LAST is required, not cosmetic: Postgres sorts NULLs FIRST in a DESC
 *  order, so a contact row created without a lastInboundAt would float above
 *  real, recent conversations at the top of the inbox. Verified against a real
 *  Postgres engine. */
export async function listConversations(churchId: string): Promise<ContactRecord[]> {
  return db
    .select()
    .from(contact)
    .where(eq(contact.churchId, churchId))
    .orderBy(sql`${contact.lastInboundAt} desc nulls last`);
}

/** A contact and its full message history, church-scoped. Null when the contact
 *  is not this church's. */
export async function loadConversation(
  churchId: string,
  contactId: string,
): Promise<{ contact: ContactRecord; messages: MessageRecord[] } | null> {
  const [row] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)))
    .limit(1);
  if (!row) return null;

  const messages = await db
    .select()
    .from(message)
    .where(and(eq(message.contactId, contactId), eq(message.churchId, churchId)))
    .orderBy(asc(message.createdAt));

  return { contact: row, messages };
}

/** Church-scoped contact-mode write for the panel, whose actions can carry any
 *  contactId the browser sends. Duplicates repo/contact.ts's updateContactMode,
 *  which is now church-scoped too (they differ only in argument order); kept
 *  separate so the panel's inbox module has no reason to import the bot's repo. */
export async function updateContactModeScoped(
  churchId: string,
  contactId: string,
  mode: ContactMode,
): Promise<void> {
  await db
    .update(contact)
    .set({ mode, modeChangedAt: new Date() })
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)));
}
