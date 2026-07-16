import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { church } from '@/db/schema';
import type { ChurchConfig } from '@/lib/types';

export type ChurchRecord = typeof church.$inferSelect;

export async function findChurchByPhoneNumberId(phoneNumberId: string): Promise<ChurchRecord | undefined> {
  const rows = await db.select().from(church).where(eq(church.phoneNumberId, phoneNumberId)).limit(1);
  return rows[0];
}

export function toChurchConfig(record: ChurchRecord): ChurchConfig {
  return {
    id: record.id,
    name: record.name,
    greetingText: record.greetingText,
    menuHeaderText: record.menuHeaderText,
    menuButtonLabel: record.menuButtonLabel,
    fallbackText: record.fallbackText,
    unsupportedMediaText: record.unsupportedMediaText,
    errorText: record.errorText,
    prayerPromptText: record.prayerPromptText,
    prayerThanksText: record.prayerThanksText,
    handoffText: record.handoffText,
    handoffClosedText: record.handoffClosedText,
  };
}
