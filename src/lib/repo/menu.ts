import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { menuItem } from '@/db/schema';
import type { MenuItemView } from '@/lib/types';

export async function loadMenuItems(churchId: string): Promise<MenuItemView[]> {
  const rows = await db.select().from(menuItem).where(eq(menuItem.churchId, churchId));
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    label: row.label,
    bodyText: row.bodyText,
    imageUrl: row.imageUrl,
    isActive: row.isActive,
    kind: row.kind,
  }));
}
