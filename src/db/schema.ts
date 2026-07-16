import {
  boolean, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

export const menuItemKindEnum = pgEnum('menu_item_kind', ['content', 'prayer', 'human']);
export const contactModeEnum = pgEnum('contact_mode', ['bot', 'awaiting_prayer', 'human']);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const prayerStatusEnum = pgEnum('prayer_status', ['novo', 'orado']);

export const church = pgTable('church', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // WhatsApp credentials live here (not env vars) so church #2 is a row.
  phoneNumberId: text('phone_number_id'),
  accessToken: text('access_token'),
  webhookVerifyToken: text('webhook_verify_token'),
  appSecret: text('app_secret'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  phoneNumberIdUq: uniqueIndex('church_phone_number_id_uq').on(t.phoneNumberId),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUq: uniqueIndex('admin_user_email_uq').on(t.email),
}));
