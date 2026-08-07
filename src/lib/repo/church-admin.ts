import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { church } from '@/db/schema';

export type ChurchRecord = typeof church.$inferSelect;

export async function getChurchById(churchId: string): Promise<ChurchRecord | undefined> {
  const rows = await db.select().from(church).where(eq(church.id, churchId)).limit(1);
  return rows[0];
}

/** The only church columns a church admin may write: its name and the bot's
 *  user-facing strings. Everything else on the row is off limits to them —
 *  `status`/`graceUntil` are the subscription lifecycle the owner console owns,
 *  and `phoneNumberId`/`accessToken`/`appSecret`/`webhookVerifyToken` are the
 *  Meta credentials that decide which tenant a phone number routes to. */
const CHURCH_EDITABLE_FIELDS = [
  'name',
  'greetingText',
  'menuHeaderText',
  'menuButtonLabel',
  'fallbackText',
  'unsupportedMediaText',
  'errorText',
  'prayerPromptText',
  'prayerThanksText',
  'handoffText',
  'handoffClosedText',
] as const;

type ChurchEditableField = (typeof CHURCH_EDITABLE_FIELDS)[number];

export async function updateChurch(
  churchId: string,
  fields: Partial<typeof church.$inferInsert>,
): Promise<void> {
  // Allowlist, not denylist: the WHERE guards which row is touched, this guards
  // what it is set to. A denylist that only stripped `id` would let one careless
  // refactor to Object.fromEntries(formData) hand a suspended church admin
  // `status=active` — un-suspending themselves without the owner console — or
  // `phoneNumberId`, claiming another tenant's Meta number and its inbound
  // messages. Unknown keys are dropped silently, exactly as updateMenuItem does.
  const safeFields: Partial<Pick<typeof church.$inferInsert, ChurchEditableField>> = {};
  for (const key of CHURCH_EDITABLE_FIELDS) {
    const value = fields[key];
    if (value !== undefined) safeFields[key] = value;
  }

  // Nothing writable was supplied — skip the query rather than issuing an
  // UPDATE with an empty SET, which drizzle rejects.
  if (Object.keys(safeFields).length === 0) return;

  await db.update(church).set(safeFields).where(eq(church.id, churchId));
}
