import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { adminUser, church, menuItem } from '@/db/schema';
import { findAdminByEmail } from '@/lib/repo/admin';
import { hashPassword } from '@/lib/auth/password';
import { CHURCH_DEFAULTS, PRIVACY_ITEM } from '@/lib/church-defaults';

export interface ProvisionResult {
  churchId: string;
  adminUserId: string;
  /** False when the Privacidade menu item could not be created. The church is
   *  usable; the owner console offers a one-click repair. */
  menuSeeded: boolean;
}

/** The single path that brings a church into existence. Signup calls this.
 *
 *  The neon-http driver has no transactions, so the three inserts cannot be
 *  atomic. Order matters: the church row first (everything references it), then
 *  the admin (without which nobody can log in), then the menu item.
 *
 *  The two failures are treated differently ON PURPOSE.
 *
 *  A failed ADMIN insert leaves a church nobody can log into — invisible in every
 *  UI, accumulating on every retry — so it is compensated by deleting the church.
 *
 *  A failed MENU insert is NOT compensated. Rolling the church back for it would
 *  destroy the expensive, hard-to-recreate part (the church row and its admin,
 *  whose globally-unique email would otherwise be wedged: `findAdminByEmail`
 *  would reject every retry with "already exists" while no delete-church action
 *  exists to clear it, making recovery manual SQL). A missing menu item is
 *  repairable in one click from the owner console; a wedged email address is not. */
export async function provisionChurch(
  name: string,
  adminEmail: string,
  password: string,
): Promise<ProvisionResult> {
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

  let adminUserId: string;
  try {
    const passwordHash = await hashPassword(password);
    const [admin] = await db
      .insert(adminUser)
      .values({ churchId: created.id, email: adminEmail, passwordHash, name: null })
      .returning();

    if (!admin) {
      throw new Error(`provisionChurch: admin insert returned no row for church ${created.id}`);
    }
    adminUserId = admin.id;
  } catch (error) {
    // No transaction to roll back, so compensate by hand.
    try {
      await db.delete(church).where(eq(church.id, created.id));
    } catch (cleanupError) {
      // The correlated case — connection lost mid-provision — fails both the
      // insert and its compensation. Swallowing that left a church nobody could
      // log into and no trace of its id anywhere. Log LOUDLY with the exact id:
      // this is the one record a human needs to clean up by hand.
      console.error(
        `provisionChurch: ORPHAN CHURCH ${created.id} ("${name}") — the admin insert failed AND the ` +
          'compensating delete failed. This church has no admin and must be deleted manually.',
        cleanupError,
      );
    }
    throw error;
  }

  // Non-fatal by design (see the header comment): the church and its admin are
  // already committed and are the part worth keeping.
  let menuSeeded = true;
  try {
    await db.insert(menuItem).values({
      churchId: created.id,
      position: PRIVACY_ITEM.position,
      label: PRIVACY_ITEM.label,
      bodyText: PRIVACY_ITEM.bodyText,
      imageUrl: null,
      isActive: true,
      kind: PRIVACY_ITEM.kind,
    });
  } catch (error) {
    menuSeeded = false;
    console.error(
      `provisionChurch: church ${created.id} ("${name}") was created WITHOUT its Privacidade menu item. ` +
        'Members have no way to read how their data is used until it is added — repair it from the ' +
        'owner console page for this church.',
      error,
    );
  }

  return { churchId: created.id, adminUserId, menuSeeded };
}
