import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { church, contact, menuItem, webhookFailure } from '@/db/schema';
import { GRACE_PERIOD_MS, type ChurchStatus } from '@/lib/church-status';
import type { AppliedMigration } from '@/lib/migration-drift';

/** OWNER-ONLY. Every query here spans churches by design — that is the whole
 *  point of the owner console. Church-facing code must never import this file;
 *  it uses the church-scoped repos instead. */

/** What a raw `sql` aggregate actually gives back, made into what the interface
 *  promises. PGlite returns a Date here and neon-http returns a string, so a repo
 *  that just forwarded the value would work in every test and break in
 *  production — which is the precise shape of the bug this file's callers keep
 *  being bitten by.
 *
 *  An unparseable value becomes null rather than an Invalid Date: null renders as
 *  "nenhuma mensagem recebida ainda", while an Invalid Date reaches
 *  Intl.RelativeTimeFormat and throws, taking down the console that exists to
 *  report things being broken. */
function toDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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
      // `sql<T>` is an ASSERTION, not a conversion, and this one was false. A raw
      // fragment carries no column, so drizzle has no timestamp mapper to apply
      // and neon-http hands back the STRING '2026-08-10 13:40:08.803+00' while
      // TypeScript swears it is a Date. It typechecked and it built for months,
      // harmlessly, because the console fetched this field and then threw it
      // away — the first render of it crashed the whole page with
      // "when.getTime is not a function". Same family as the two incidents this
      // week: the code and the live database disagreed, and nothing said so.
      .select({ at: sql<string | Date | null>`max(${contact.lastInboundAt})` })
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
      lastInboundAt: toDate(last[0]?.at ?? null),
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

/** Postgres: undefined_table, and invalid_schema_name for drivers that report the
 *  missing `drizzle` schema as the schema rather than the relation. */
const NO_MIGRATIONS_TABLE = new Set(['42P01', '3F000']);

/** THE SQLSTATE IS NOT ON THE ERROR YOU CATCH. drizzle rethrows every driver
 *  failure as its own `Failed query: …` Error and hangs the original — the one
 *  carrying `code: '42P01'` — off `.cause`. Reading `error.code` alone finds
 *  undefined, decides this is not a missing table, and rethrows, which turns a
 *  never-migrated database into a 500 on the owner console instead of the alarm
 *  that says so. So the whole chain is walked, bounded in case a driver ever
 *  hands back a cycle.
 *
 *  Both conditions of the text fallback are checked on the SAME layer on
 *  purpose. The wrapper's message quotes the SQL, so it always contains
 *  `__drizzle_migrations`; the cause's message always contains "does not exist"
 *  for a missing COLUMN too. Testing them across layers would swallow
 *  `column "created_at" does not exist` — a real, different breakage — and
 *  report all clear for a database this code cannot actually read. */
function isMissingMigrationsTable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && NO_MIGRATIONS_TABLE.has(code)) return true;
    const message = current instanceof Error ? current.message : '';
    if (/__drizzle_migrations/.test(message) && /does not exist/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** OWNER-ONLY, and this one is not owner-only by convention — it is cross-church
 *  infrastructure state. drizzle.__drizzle_migrations describes the whole
 *  deployment, not a tenant: no church_id exists to scope it by, and no church
 *  has any business learning what the vendor's schema is doing. It sits in this
 *  file so tests/privilege-boundary.test.ts keeps it out of every church-facing
 *  path, the same way it does for the queries that span churches.
 *
 *  Returns [] when the migrations table does not exist. A missing table and an
 *  empty table say the same operational thing — `drizzle-kit migrate` has never
 *  completed against this database — and the caller reports that as total drift
 *  (MigrationDrift.neverMigrated), which is exactly right. Every other failure
 *  throws: a detector that cannot tell "no drift" from "could not look" is worse
 *  than none, because it is trusted. */
export async function readAppliedMigrations(): Promise<AppliedMigration[]> {
  try {
    const result = await db.execute(
      sql`select created_at from drizzle.__drizzle_migrations order by created_at`,
    );
    // Both drivers return { rows: [...] }; the shapes differ in everything else.
    const rows = (result as unknown as { rows: Array<{ created_at: string | number | null }> }).rows;
    // created_at is a bigint, which every driver here hands back as a STRING —
    // '1786369208803', not 1786369208803. Left unconverted it would match no
    // journal entry at all and report a healthy database as fully drifted.
    // Number(null) is 0 and Number('garbage') is NaN; both fail to match any
    // journal entry and surface as `extra`, which is the honest reading of a row
    // this code cannot account for.
    return rows.map((row) => ({ createdAt: Number(row.created_at) }));
  } catch (error) {
    if (isMissingMigrationsTable(error)) return [];
    throw error;
  }
}

export interface WebhookFailureSummary {
  churchId: string | null;
  /** null for a failure that happened before the church was identified, which is
   *  what a broken church lookup — the 2026-08-10 outage — produces. */
  churchName: string | null;
  reason: string;
  failureCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/** OWNER-ONLY, and the reason is the point rather than the convention: this table
 *  is cross-church by construction (one row may belong to any tenant, or to
 *  none), so one church reading it would be reading about the others. The WRITE
 *  is not owner-only and lives in src/lib/repo/webhook-failure.ts, which the
 *  webhook imports — recording a failure about yourself is not a privilege, and
 *  tests/privilege-boundary.test.ts keeps this half out of the webhook.
 *
 *  Ordered by recency and limited: the console asks "what is broken NOW", and an
 *  alarm that renders a hundred rows is one nobody reads. */
export async function listRecentWebhookFailures(
  since: Date,
  limit = 20,
): Promise<WebhookFailureSummary[]> {
  return db
    .select({
      churchId: webhookFailure.churchId,
      churchName: church.name,
      reason: webhookFailure.reason,
      failureCount: webhookFailure.failureCount,
      firstSeenAt: webhookFailure.firstSeenAt,
      lastSeenAt: webhookFailure.lastSeenAt,
    })
    .from(webhookFailure)
    // LEFT join: an inner one would hide exactly the rows that matter most, the
    // ones with no church attached.
    .leftJoin(church, eq(church.id, webhookFailure.churchId))
    .where(gt(webhookFailure.lastSeenAt, since))
    .orderBy(desc(webhookFailure.lastSeenAt))
    .limit(limit);
}
