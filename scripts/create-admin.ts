import 'dotenv/config';
import { getChurchForOwner, getOnlyChurch, listChurches } from '../src/lib/repo/platform';
import { createAdmin, findAdminByEmail } from '../src/lib/repo/admin';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const argv = process.argv.slice(2);
  const churchFlag = argv.indexOf('--church');
  const explicitChurchId = churchFlag === -1 ? undefined : argv[churchFlag + 1];
  const [email, password, name] = churchFlag === -1 ? argv : argv.filter((_, i) => i !== churchFlag && i !== churchFlag + 1);

  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> [name] [--church <churchId>]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const churchRow = explicitChurchId
    ? await getChurchForOwner(explicitChurchId)
    : await getOnlyChurch();

  if (!churchRow) {
    const all = await listChurches();
    if (all.length === 0) {
      console.error('No church found. Create one first: npm run create-church -- <name> <adminEmail> <password>');
    } else if (explicitChurchId) {
      console.error(`No church with id ${explicitChurchId}.`);
    } else {
      console.error('More than one church exists — pass --church <id>:');
      for (const c of all) console.error(`  ${c.id}  ${c.name}`);
    }
    process.exitCode = 1;
    return;
  }

  if (await findAdminByEmail(email)) {
    console.error(`An admin with email ${email} already exists.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  await createAdmin({ churchId: churchRow.id, email, passwordHash, name: name ?? null });
  console.log(`Admin created: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
