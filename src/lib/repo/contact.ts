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

export async function updateContactMode(contactId: string, mode: ContactMode): Promise<void> {
  await db.update(contact).set({ mode, modeChangedAt: new Date() }).where(eq(contact.id, contactId));
}

export async function touchLastInbound(contactId: string): Promise<void> {
  await db.update(contact).set({ lastInboundAt: new Date() }).where(eq(contact.id, contactId));
}
