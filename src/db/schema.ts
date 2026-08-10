import {
  boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
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
   *  CHURCH_DEFAULTS rather than retyped, so the seed a new church gets and the
   *  backfill an existing church got cannot drift into two different sentences.
   *  It stays editable data either way — Configurações writes this column. */
  courtesyText: text('courtesy_text').notNull().default(CHURCH_DEFAULTS.courtesyText),
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
}));

export const prayerRequest = pgTable('prayer_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => church.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  status: prayerStatusEnum('status').notNull().default('novo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
