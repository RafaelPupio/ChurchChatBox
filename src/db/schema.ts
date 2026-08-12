import {
  boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
// New: the partial-index predicate and the coalesce() expression index below are
// raw SQL fragments. This file imported nothing from 'drizzle-orm' before.
import { sql } from 'drizzle-orm';
// Relative, not the '@/…' alias: drizzle-kit bundles this file outside Next's
// tsconfig path resolution. The module it reaches is data only, no imports.
import { CHURCH_DEFAULTS } from '../lib/church-defaults';

export const menuItemKindEnum = pgEnum('menu_item_kind', ['content', 'prayer', 'human']);
export const contactModeEnum = pgEnum('contact_mode', ['bot', 'awaiting_prayer', 'human']);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const prayerStatusEnum = pgEnum('prayer_status', ['novo', 'orado']);
export const churchStatusEnum = pgEnum('church_status', ['active', 'past_due', 'suspended']);

export const church = pgTable('church', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // WhatsApp credentials live here (not env vars) so church #2 is a row.
  phoneNumberId: text('phone_number_id'),
  accessToken: text('access_token'),
  webhookVerifyToken: text('webhook_verify_token'),
  appSecret: text('app_secret'),
  // Subscription lifecycle. Stripe writes these in a later plan; until then the
  // owner console sets status by hand. Created now to avoid a second migration.
  status: churchStatusEnum('status').notNull().default('active'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  graceUntil: timestamp('grace_until', { withTimezone: true }),
  // Every user-facing string. Editable in the panel; never hardcoded.
  greetingText: text('greeting_text').notNull(),
  menuHeaderText: text('menu_header_text').notNull(),
  menuButtonLabel: text('menu_button_label').notNull(),
  fallbackText: text('fallback_text').notNull(),
  unsupportedMediaText: text('unsupported_media_text').notNull(),
  errorText: text('error_text').notNull(),
  prayerPromptText: text('prayer_prompt_text').notNull(),
  prayerThanksText: text('prayer_thanks_text').notNull(),
  handoffText: text('handoff_text').notNull(),
  handoffClosedText: text('handoff_closed_text').notNull(),
  /** The reply to "obrigada" / "amém" / "Deus abençoe".
   *
   *  The ONLY bot text carrying a database-level default, and only because it was
   *  added to a table that already had rows: `ADD COLUMN … NOT NULL` without one
   *  fails against every church already in production. The value is imported from
   *  CHURCH_DEFAULTS so the two are the same sentence AT THE MOMENT the migration
   *  is generated — and no longer than that. `drizzle-kit generate` bakes the
   *  literal into SQL, so editing CHURCH_DEFAULTS afterwards changes what a NEW
   *  church is seeded with and cannot reach a row already backfilled. That
   *  happened within the hour: the wording was improved right after 0005 was
   *  generated, and the two diverged.
   *
   *  So this default is a one-time floor for rows that predate the column, not a
   *  live mirror of CHURCH_DEFAULTS. If the wording changes again and existing
   *  churches should follow, that is a data migration, written deliberately —
   *  and only for rows a church has not edited, since this column is theirs.
   *  It stays editable either way: Configurações writes it. */
  courtesyText: text('courtesy_text').notNull().default(CHURCH_DEFAULTS.courtesyText),
  /** Round-robin cursor for the cross-church retention purge. SYSTEM STATE: never
   *  rendered to a church, never editable in either panel, never seeded. Lives on
   *  `church` rather than in its own table so it disappears with the church for
   *  free. NULL means "never purged", which sorts first — see
   *  listChurchIdsForPurge's `NULLS FIRST`. */
  retentionPurgedAt: timestamp('retention_purged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Both nullable, both unique. Postgres allows many NULLs under a unique index,
  // which is exactly right: any number of churches may be unconfigured, but no two
  // may share an identity.
  //
  // phone_number_id decides which tenant an inbound message belongs to — a
  // duplicate makes findChurchByPhoneNumberId non-deterministic, i.e. a member's
  // message could be answered by, and recorded against, the wrong church.
  // webhook_verify_token is what Meta's GET handshake resolves a church by — a
  // duplicate means two churches would both verify the same subscription.
  phoneNumberIdUq: uniqueIndex('church_phone_number_id_uq').on(t.phoneNumberId),
  webhookVerifyTokenUq: uniqueIndex('church_webhook_verify_token_uq').on(t.webhookVerifyToken),
}));

export const menuItem = pgTable('menu_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  label: text('label').notNull(),
  bodyText: text('body_text').notNull().default(''),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').notNull().default(true),
  kind: menuItemKindEnum('kind').notNull().default('content'),
});

export const contact = pgTable('contact', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  name: text('name'),
  mode: contactModeEnum('mode').notNull().default('bot'),
  modeChangedAt: timestamp('mode_changed_at', { withTimezone: true }).notNull().defaultNow(),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
  // Set only after the greeting has actually left for this contact. Distinct from
  // "the row is new": a row can be created while the church is suspended, or while
  // a send is failing, and in neither case has the member been greeted.
  greetedAt: timestamp('greeted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  churchPhoneUq: uniqueIndex('contact_church_phone_uq').on(t.churchId, t.phone),
  // An EXPRESSION index, deliberately NOT ('church_id','last_inbound_at'). The idle
  // predicate is coalesce(last_inbound_at, created_at) < $cutoff, and a plain column
  // index is not sargable against a coalesce() over two columns.
  churchIdleIdx: index('contact_church_idle_idx')
    .on(t.churchId, sql`coalesce(${t.lastInboundAt}, ${t.createdAt})`),
}));

export const message = pgTable('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  // Unique: Meta re-delivers messages even on success. NULL for outbound
  // (Postgres allows many NULLs in a unique index).
  waMessageId: text('wa_message_id'),
  direction: messageDirectionEnum('direction').notNull(),
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  waMessageIdUq: uniqueIndex('message_wa_message_id_uq').on(t.waMessageId),
  // The purge's age arm: church_id = $1 AND created_at < $cutoff.
  churchCreatedIdx: index('message_church_created_idx').on(t.churchId, t.createdAt),
  // ONE index serving TWO predicates: the purge's church-scoped NOT EXISTS guard
  // (leading pair) and the export's keyset page, whose ORDER BY is (created_at, id)
  // within one contact (all four columns). Two narrower indexes would be one more
  // than the work needs.
  contactKeysetIdx: index('message_contact_keyset_idx').on(t.churchId, t.contactId, t.createdAt, t.id),
}));

export const prayerRequest = pgTable('prayer_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  status: prayerStatusEnum('status').notNull().default('novo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Serves the purge's age arm AND the 30-day expiring-prayers warning and export,
  // which are the same predicate at two different cutoffs.
  churchCreatedIdx: index('prayer_request_church_created_idx').on(t.churchId, t.createdAt),
  contactKeysetIdx: index('prayer_request_contact_keyset_idx').on(t.churchId, t.contactId, t.createdAt, t.id),
}));

// Created now so the admin-panel plan needs no second migration.
export const adminUser = pgTable('admin_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  /** The session-revocation epoch. Bumped by every password change (reset or
   *  self-service), and stamped into the session cookie at login.
   *
   *  This exists because iron-session is a SEALED STATELESS COOKIE: there is no
   *  server-side session store to delete from, so changing a password cannot on
   *  its own log anybody out. Without this column, a member of staff who resets
   *  their password because they think someone else has it would leave that other
   *  person's session working for up to the full 8h TTL — the exact scenario a
   *  password reset is supposed to end.
   *
   *  The comparison is free: src/lib/auth/writable.ts already re-reads this row
   *  on every page load and every write, so the guard gains a field comparison
   *  and not a query. See that file for the residual gap this does NOT close. */
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUq: uniqueIndex('admin_user_email_uq').on(t.email),
}));

/** Self-service password reset.
 *
 *  Stores a SHA-256 of the token and never the token itself, for the same reason
 *  admin_user stores a bcrypt hash and never the password: a database leak — a
 *  backup on a laptop, a read-replica handed to a contractor — must not hand over
 *  live reset links to every church's panel. SHA-256 rather than bcrypt is
 *  deliberate and is justified in src/lib/auth/reset-token.ts.
 *
 *  No church_id, and that is not an oversight of the church-scoping rule. A reset
 *  is requested by someone with no session and therefore no church context; the
 *  only key that can find the row is the 256-bit token itself, and the church is
 *  then whatever the referenced admin_user row says it is. A denormalised
 *  church_id here could only ever disagree with that row, and there is no query
 *  in the product that lists these by church. The FK cascade means deleting an
 *  admin (removeStaff) also destroys their outstanding reset links. */
export const passwordResetToken = pgTable('password_reset_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull().references(() => adminUser.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Set by the single atomic UPDATE that consumes the token. NULL means unused. */
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Unique so consumption can be a single indexed UPDATE ... WHERE token_hash = $1,
  // which is what makes single-use atomic without a transaction.
  tokenHashUq: uniqueIndex('password_reset_token_hash_uq').on(t.tokenHash),
  // Every other query here is "all tokens for this admin": the per-admin request
  // throttle and the invalidate-all-siblings step.
  adminUserIdIdx: index('password_reset_token_admin_user_id_idx').on(t.adminUserId),
}));

/** Platform owner (Rafael). Deliberately has NO church_id — an owner belongs to
 *  no church. This is why owner auth is a separate table rather than a role flag
 *  on admin_user, whose church_id is NOT NULL. */
export const ownerUser = pgTable('owner_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUq: uniqueIndex('owner_user_email_uq').on(t.email),
}));

/** The webhook's catch block, made visible.
 *
 *  The webhook ALWAYS returns 200 — a non-200 makes Meta retry and a retry means
 *  a member is answered twice — so a hard failure becomes an invisible one: Meta
 *  is satisfied, the member gets silence, and nobody is told. On 2026-08-10
 *  migration 0005 was generated and never applied, findChurchByPhoneNumberId
 *  selected a column that did not exist, and every member of every church got
 *  nothing for hours. This table is the row that would have said so.
 *
 *  ONE ROW PER (church, reason), NOT one per failure. A broken church produces a
 *  failure per inbound message; on a Sunday morning that is thousands of
 *  identical rows saying one thing. The upsert in src/lib/repo/webhook-failure.ts
 *  counts instead, so the table's size is bounded by how many DISTINCT ways the
 *  product is broken, which is a small number even during a total outage.
 *
 *  church_id is NULLABLE and that is the common case, not the edge case: today's
 *  failure was IN the church lookup, so there was no church to attribute it to.
 *  A schema that demanded one would have had nothing to record on the very day it
 *  was needed. */
export const webhookFailure = pgTable('webhook_failure', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').references(() => church.id, { onDelete: 'cascade' }),
  /** The error's message, whitespace-collapsed, digit-redacted and truncated by
   *  toFailureReason(). Stored raw and uninterpreted — the reading side may guess
   *  what it means, the recording side may not. */
  reason: text('reason').notNull(),
  /** Failures in the CURRENT incident, not since the beginning of time. The
   *  upsert restarts the count (and first_seen_at) when the previous failure is
   *  older than FAILURE_WINDOW_MS, so "412 falhas" always means "412 since this
   *  started" rather than a number accumulated across months of unrelated blips. */
  failureCount: integer('failure_count').notNull().default(1),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // NULLS NOT DISTINCT is the whole reason this is a constraint and not a plain
  // unique index (drizzle 0.45 only exposes the modifier here). Under Postgres's
  // default, every NULL church_id is distinct from every other, so the
  // before-we-know-the-church failures — today's incident exactly — would insert
  // a fresh row per inbound message and the aggregation would silently not
  // aggregate for the one case it matters most for.
  churchReasonUq: unique('webhook_failure_church_reason_uq').on(t.churchId, t.reason).nullsNotDistinct(),
  // The owner console only ever asks "what failed recently", ordered by recency.
  lastSeenIdx: index('webhook_failure_last_seen_idx').on(t.lastSeenAt),
}));

export const erasureReasonEnum = pgEnum('erasure_reason', ['subject_request', 'retention']);
export const erasureStatusEnum = pgEnum('erasure_status', ['pending', 'done']);

/** Proof that a deletion happened, which is never a copy of what was deleted.
 *
 *  Two kinds of row share this table. A `subject_request` row is one member's
 *  Art. 18 VI erasure, performed by a named secretary. A `retention` row is one
 *  church's slice of one nightly purge. Both are written `pending` BEFORE any
 *  delete and flipped to `done` after, so the dangerous direction — a receipt
 *  asserting a deletion over data that still exists — is impossible by ordering
 *  rather than prevented by care.
 *
 *  Holds no phone, no name and no body text. If someone with database access
 *  wants to know WHO was erased they need ERASURE_HASH_SECRET and a candidate
 *  number to test: a guessing game, not a list. */
export const erasureRecord = pgTable('erasure_record', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  reason: erasureReasonEnum('reason').notNull(),
  status: erasureStatusEnum('status').notNull().default('pending'),
  /** Deliberately NOT a foreign key to contact. An FK would cascade this proof
   *  away together with the very row it exists to prove was deleted. Kept so the
   *  pending→done resume can find its target and so the partial unique index has
   *  something to key on; after the delete it is a random UUID correlating to
   *  nothing without a copy of the old database. */
  subjectContactId: uuid('subject_contact_id'),
  subjectPhoneHash: text('subject_phone_hash'),
  /** A text SNAPSHOT, not a reference to admin_user. An FK with ON DELETE SET NULL
   *  would erase the actor from the audit trail the day that secretary leaves the
   *  church — precisely when the record matters. */
  performedByEmail: text('performed_by_email'),
  messagesDeleted: integer('messages_deleted').notNull().default(0),
  prayersDeleted: integer('prayers_deleted').notNull().default(0),
  contactsDeleted: integer('contacts_deleted').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  churchCreatedIdx: index('erasure_record_church_created_idx').on(t.churchId, t.createdAt),
  phoneHashIdx: index('erasure_record_phone_hash_idx').on(t.churchId, t.subjectPhoneHash),
  /** THE guard that makes a double-click harmless: one subject-request receipt per
   *  contact, enforced by Postgres rather than by a read-then-write pre-check that
   *  would be TOCTOU. PARTIAL, so retention rows (subject_contact_id IS NULL) are
   *  unaffected — and a total unique index would have allowed unlimited NULLs
   *  anyway, i.e. enforced nothing where it matters. */
  subjectUq: uniqueIndex('erasure_record_subject_uq')
    .on(t.churchId, t.subjectContactId)
    .where(sql`${t.reason} = 'subject_request'`),
}));
