import { and, asc, count, eq, max } from 'drizzle-orm';
import { db } from '@/db/client';
import { menuItem } from '@/db/schema';
import type { MenuItemKind } from '@/lib/types';
import { positionsFromOrder } from '@/lib/menu-admin-rules';

export type MenuItemRow = typeof menuItem.$inferSelect;

export async function listMenuItemsForAdmin(churchId: string): Promise<MenuItemRow[]> {
  return db
    .select()
    .from(menuItem)
    .where(eq(menuItem.churchId, churchId))
    .orderBy(asc(menuItem.position));
}

export async function createMenuItem(item: {
  churchId: string;
  position: number;
  label: string;
  bodyText: string;
  imageUrl: string | null;
  isActive: boolean;
  kind: MenuItemKind;
}): Promise<MenuItemRow> {
  const [created] = await db.insert(menuItem).values(item).returning();
  return created;
}

/** Church-scoped: a mutation for an id that is not this church's is a no-op, so one
 *  church can never edit or hide another church's menu item. */
export async function updateMenuItem(
  id: string,
  churchId: string,
  fields: Partial<typeof menuItem.$inferInsert>,
): Promise<void> {
  await db.update(menuItem).set(fields).where(and(eq(menuItem.id, id), eq(menuItem.churchId, churchId)));
}

export async function countActiveMenuItems(churchId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(menuItem)
    .where(and(eq(menuItem.churchId, churchId), eq(menuItem.isActive, true)));
  return rows[0]?.n ?? 0;
}

export async function getNextPosition(churchId: string): Promise<number> {
  const rows = await db
    .select({ maxPos: max(menuItem.position) })
    .from(menuItem)
    .where(eq(menuItem.churchId, churchId));
  return (rows[0]?.maxPos ?? 0) + 1;
}

/** The neon-http driver has no transactions, so positions are written one row at
 *  a time. Positions are recomputed from the full order, so a partial failure
 *  leaves a consistent (if briefly reordered) menu rather than duplicate indices. */
export async function reorderMenuItems(churchId: string, orderedIds: string[]): Promise<void> {
  const positions = positionsFromOrder(orderedIds);
  for (const { id, position } of positions) {
    await db
      .update(menuItem)
      .set({ position })
      .where(and(eq(menuItem.id, id), eq(menuItem.churchId, churchId)));
  }
}
