import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, message } from '@/db/schema';
import type { ContactRecord } from '@/lib/repo/contact';
import { THREAD_WINDOW, windowThread } from '@/lib/thread-window';
import type { ContactMode } from '@/lib/types';

export type MessageRecord = typeof message.$inferSelect;

/** All of the church's contacts. Waiting-on-a-human first, then most-recently-
 *  active.
 *
 *  The handoff key comes first because "someone asked for a person and nobody has
 *  answered" outranks "someone messaged the bot recently". Nothing pushes that
 *  fact into the panel, so the order of this list is most of how a secretary
 *  learns it.
 *
 *  NULLS LAST is required, not cosmetic: Postgres sorts NULLs FIRST in a DESC
 *  order, so a contact row created without a lastInboundAt would float above
 *  real, recent conversations at the top of the inbox. Verified against a real
 *  Postgres engine. */
export async function listConversations(churchId: string): Promise<ContactRecord[]> {
  return db
    .select()
    .from(contact)
    .where(eq(contact.churchId, churchId))
    .orderBy(sql`(${contact.mode} = 'human') desc, ${contact.lastInboundAt} desc nulls last`);
}

/** How many of this church's conversations are waiting on a person.
 *
 *  Drives the Caixa tab badge. Push notifications are out of scope, so until they
 *  exist the only way a secretary learns that someone asked for a human is by
 *  opening Caixa de Entrada and looking. This badge is the substitute, which is
 *  why it is read on every page load of every screen rather than only on the
 *  inbox — deliberately, and it costs one indexed count. */
export async function countHandoffContacts(churchId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.mode, 'human')));
  return row?.n ?? 0;
}

/** A contact and the most recent slice of its message history, church-scoped.
 *  Null when the contact is not this church's.
 *
 *  BOUNDED, deliberately. This used to select every message the contact had ever
 *  exchanged, with no LIMIT — and since the open thread re-runs this query on
 *  every poll tick, a long conversation re-read and re-serialised itself over the
 *  secretary's phone plan roughly four times a minute, indefinitely. `truncated`
 *  is passed up so the page can SAY that older messages exist; silently hiding
 *  history she may be scrolling back through would be a worse bug than the cost.
 *
 *  Ordered newest-first here and flipped by windowThread, because "the 200 most
 *  recent" is not expressible with an ascending sort and a LIMIT. The id is a
 *  tiebreaker, not decoration: two messages can share a createdAt, and without a
 *  total order the row at the window boundary could drift in and out of the slice
 *  between two polls of the same unchanged thread. */
export async function loadConversation(
  churchId: string,
  contactId: string,
  limit: number = THREAD_WINDOW,
): Promise<{ contact: ContactRecord; messages: MessageRecord[]; truncated: boolean } | null> {
  const [row] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)))
    .limit(1);
  if (!row) return null;

  // One row past the window: its presence is what proves there is older history,
  // and it costs less than a second COUNT query.
  const newestFirst = await db
    .select()
    .from(message)
    .where(and(eq(message.contactId, contactId), eq(message.churchId, churchId)))
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(limit + 1);

  const { messages, truncated } = windowThread(newestFirst, limit);
  return { contact: row, messages, truncated };
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
