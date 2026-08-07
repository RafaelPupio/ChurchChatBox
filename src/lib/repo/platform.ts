import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { church, contact, menuItem } from '@/db/schema';
import { GRACE_PERIOD_MS, type ChurchStatus } from '@/lib/church-status';

/** OWNER-ONLY. Every query here spans churches by design — that is the whole
 *  point of the owner console. Church-facing code must never import this file;
 *  it uses the church-scoped repos instead. */

export interface ChurchSummary {
  id: string;
  name: string;
  status: ChurchStatus;
  graceUntil: Date | null;
  whatsappConnected: boolean;
  activeMenuItems: number;
  lastInboundAt: Date | null;
  createdAt: Date;
}

export async function listChurches(): Promise<ChurchSummary[]> {
  const rows = await db.select().from(church).orderBy(church.createdAt);

  const summaries: ChurchSummary[] = [];
  for (const row of rows) {
    const items = await db
      .select({ n: count() })
      .from(menuItem)
      .where(and(eq(menuItem.churchId, row.id), eq(menuItem.isActive, true)));

    const last = await db
      .select({ at: sql<Date | null>`max(${contact.lastInboundAt})` })
      .from(contact)
      .where(eq(contact.churchId, row.id));

    summaries.push({
      id: row.id,
      name: row.name,
      status: row.status,
      graceUntil: row.graceUntil,
      // All THREE, not just the two that send. The webhook refuses to process an
      // inbound message without app_secret (it cannot verify Meta's signature
      // without it), so a church missing only that one reads as connected while
      // every member message is silently dropped and no reply is ever sent.
      whatsappConnected: !!row.phoneNumberId && !!row.accessToken && !!row.appSecret,
      activeMenuItems: items[0]?.n ?? 0,
      lastInboundAt: last[0]?.at ?? null,
      createdAt: row.createdAt,
    });
  }
  return summaries;
}

export async function getChurchForOwner(churchId: string) {
  const rows = await db.select().from(church).where(eq(church.id, churchId)).limit(1);
  return rows[0];
}

/** Two different rules on purpose.
 *
 *  The secrets (accessToken, appSecret) never round-trip to the browser, so their
 *  field is blank on every render — blank therefore means "keep", not "clear".
 *
 *  phoneNumberId and webhookVerifyToken DO round-trip and are always written,
 *  with empty mapped to null. That matters: phone_number_id is globally unique,
 *  so moving a number between churches requires clearing it on the old one
 *  first. A blanket keep-on-blank rule would make that impossible and would also
 *  remove the ability to disconnect a church by clearing its credentials. */
export async function setChurchCredentials(
  churchId: string,
  fields: { phoneNumberId?: string; accessToken?: string; appSecret?: string; webhookVerifyToken?: string },
): Promise<void> {
  const update: Record<string, string | null> = {
    phoneNumberId: fields.phoneNumberId?.trim() || null,
    webhookVerifyToken: fields.webhookVerifyToken?.trim() || null,
  };
  if (fields.accessToken) update.accessToken = fields.accessToken;
  if (fields.appSecret) update.appSecret = fields.appSecret;
  await db.update(church).set(update).where(eq(church.id, churchId));
}

export async function setChurchStatus(
  churchId: string,
  status: ChurchStatus,
  now: Date = new Date(),
): Promise<void> {
  // past_due is the only status that starts a clock. It writes the deadline here
  // rather than leaving it null, because effectiveStatus reads a null grace_until
  // as "past_due forever" — which is why the grace branch was unreachable before:
  // nothing in the product ever wrote this column.
  //
  // For active and suspended, clearing grace_until keeps the computed
  // effectiveStatus honest — a manually reactivated church is not still counting
  // down an old deadline.
  const graceUntil = status === 'past_due' ? new Date(now.getTime() + GRACE_PERIOD_MS) : null;
  await db.update(church).set({ status, graceUntil }).where(eq(church.id, churchId));
}

/** Returns the church only when there is exactly one. Used by local scripts that
 *  used to assume a single church; ambiguous once a second church exists. */
export async function getOnlyChurch() {
  const rows = await db.select().from(church).limit(2);
  return rows.length === 1 ? rows[0] : undefined;
}
