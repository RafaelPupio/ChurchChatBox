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
  // Strip id/churchId from the payload: the WHERE guards which row is touched, this
  // guards what it is set to — so a caller can never repoint an item to another
  // church or change its id via .set().
  const { id: _id, churchId: _churchId, ...safeFields } = fields;
  await db.update(menuItem).set(safeFields).where(and(eq(menuItem.id, id), eq(menuItem.churchId, churchId)));
}

/** Total items, active or not — the question "does this church have a menu at
 *  all?", which is what the owner console's Privacidade repair keys off. An
 *  inactive Privacidade item is still present and must not be duplicated. */
export async function countMenuItems(churchId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(menuItem)
    .where(eq(menuItem.churchId, churchId));
  return rows[0]?.n ?? 0;
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
