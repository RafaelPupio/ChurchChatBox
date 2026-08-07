import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact } from '@/db/schema';
import type { ContactMode } from '@/lib/types';

export type ContactRecord = typeof contact.$inferSelect;

export async function findOrCreateContact(
  churchId: string,
  phone: string,
  name: string | null,
): Promise<{ contact: ContactRecord; isFirstContact: boolean }> {
  const existing = await db
    .select()
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.phone, phone)))
    .limit(1);

  if (existing[0]) {
    return { contact: existing[0], isFirstContact: false };
  }

  const [created] = await db
    .insert(contact)
    .values({ churchId, phone, name })
    .onConflictDoNothing({ target: [contact.churchId, contact.phone] })
    .returning();

  if (created) {
    return { contact: created, isFirstContact: true };
  }

  // Lost the race: another invocation created this contact between our SELECT and
  // INSERT. Re-fetch it — they are no longer a first contact.
  const [raced] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.phone, phone)))
    .limit(1);

  if (!raced) {
    throw new Error(`Contact race condition: could not find contact after conflicted insert for churchId=${churchId}, phone=${phone}`);
  }

  return { contact: raced, isFirstContact: false };
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
