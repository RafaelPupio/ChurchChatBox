import { db } from '@/db/client';
import { prayerRequest } from '@/db/schema';

export async function savePrayerRequest(churchId: string, contactId: string, text: string): Promise<void> {
  await db.insert(prayerRequest).values({ churchId, contactId, text });
}
