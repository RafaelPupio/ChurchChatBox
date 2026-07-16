import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, message } from '@/db/schema';
import type { ContactRecord } from '@/lib/repo/contact';
import type { ContactMode } from '@/lib/types';

export type MessageRecord = typeof message.$inferSelect;

/** All of the church's contacts, most-recently-active first. Contacts that have
 *  talked to the bot all have lastInboundAt set. */
export async function listConversations(churchId: string): Promise<ContactRecord[]> {
  return db
    .select()
    .from(contact)
    .where(eq(contact.churchId, churchId))
    .orderBy(desc(contact.lastInboundAt));
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

/** Church-scoped contact-mode write. The bot's updateContactMode is NOT scoped;
 *  the panel must never call it — a panel action could carry any contactId. */
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
