import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact } from '@/db/schema';
import type { ContactMode } from '@/lib/types';

export type ContactRecord = typeof contact.$inferSelect;

/** Returns the contact row, creating it if this number has never written before.
 *
 *  Deliberately does NOT report whether the row was just created. That fact used
 *  to drive the greeting, and it was the wrong fact: a row is created the moment a
 *  member writes, even when the church is suspended and nothing is sent back, so
 *  "new row" and "has been greeted" are different things. Greeting-ness is now a
 *  durable column (`greetedAt`) written only after a greeting actually leaves. */
export async function findOrCreateContact(
  churchId: string,
  phone: string,
  name: string | null,
): Promise<ContactRecord> {
  const existing = await db
    .select()
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.phone, phone)))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const [created] = await db
    .insert(contact)
    .values({ churchId, phone, name })
    .onConflictDoNothing({ target: [contact.churchId, contact.phone] })
    .returning();

  if (created) {
    return created;
  }

  // Lost the race: another invocation created this contact between our SELECT and
  // INSERT. Re-fetch it.
  const [raced] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.phone, phone)))
    .limit(1);

  if (!raced) {
    throw new Error(`Contact race condition: could not find contact after conflicted insert for churchId=${churchId}, phone=${phone}`);
  }

  return raced;
}

/** Church-scoped, like every other mutation in the repo layer. The webhook is the
 *  only caller today and its contactId always comes from a church-scoped lookup,
 *  so a bare id is safe *right now* — but that safety lives in prose, and prose is
 *  not a control. The second predicate makes a cross-church write structurally
 *  impossible instead of merely unreached. */
export async function updateContactMode(
  contactId: string,
  churchId: string,
  mode: ContactMode,
): Promise<void> {
  await db
    .update(contact)
    .set({ mode, modeChangedAt: new Date() })
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)));
}

export async function touchLastInbound(contactId: string, churchId: string): Promise<void> {
  await db
    .update(contact)
    .set({ lastInboundAt: new Date() })
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)));
}

/** Records that the greeting has actually been delivered. Called only after the
 *  send succeeded — the entire point of the column is that a row created while the
 *  church was suspended, or while a send was failing, is not a greeted contact. */
export async function markGreeted(contactId: string, churchId: string): Promise<void> {
  await db
    .update(contact)
    .set({ greetedAt: new Date() })
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)));
}
