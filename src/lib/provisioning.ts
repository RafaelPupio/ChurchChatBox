import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { adminUser, church, menuItem } from '@/db/schema';
import { findAdminByEmail } from '@/lib/repo/admin';
import { hashPassword } from '@/lib/auth/password';
import { CHURCH_DEFAULTS, PRIVACY_ITEM } from '@/lib/church-defaults';

/** The single path that brings a church into existence. Signup calls this.
 *
 *  The neon-http driver has no transactions, so the three inserts cannot be
 *  atomic. Order matters: the church row first (everything references it), then
 *  the admin (without which nobody can log in), then the menu item (cosmetic —
 *  a church with no Privacidade item still works and can add one). */
export async function provisionChurch(
  name: string,
  adminEmail: string,
  password: string,
): Promise<{ churchId: string; adminUserId: string }> {
  // admin_user.email is GLOBALLY unique — it has to be, because login resolves
  // the tenant from the email alone. So one address can own exactly one church
  // platform-wide. Check first: without this, a reused address (secretaria@…,
  // or simply a retry) commits the church row and then throws on the admin
  // insert, stranding an orphan church with no admin and no way to log in.
  if (await findAdminByEmail(adminEmail)) {
    throw new Error(`provisionChurch: an admin with the email ${adminEmail} already exists`);
  }

  const [created] = await db
    .insert(church)
    .values({ ...CHURCH_DEFAULTS, name, status: 'active' })
    .returning();

  if (!created) {
    throw new Error('provisionChurch: church insert returned no row');
  }

  try {
    const passwordHash = await hashPassword(password);
    const [admin] = await db
      .insert(adminUser)
      .values({ churchId: created.id, email: adminEmail, passwordHash, name: null })
      .returning();

    if (!admin) {
      throw new Error(`provisionChurch: admin insert returned no row for church ${created.id}`);
    }

    await db.insert(menuItem).values({
      churchId: created.id,
      position: PRIVACY_ITEM.position,
      label: PRIVACY_ITEM.label,
      bodyText: PRIVACY_ITEM.bodyText,
      imageUrl: null,
      isActive: true,
      kind: PRIVACY_ITEM.kind,
    });

    return { churchId: created.id, adminUserId: admin.id };
  } catch (error) {
    // No transaction to roll back, so compensate by hand — a church nobody can
    // log into is invisible in every UI and would accumulate on every retry.
    await db.delete(church).where(eq(church.id, created.id)).catch(() => {});
    throw error;
  }
}
