import 'dotenv/config';
import { getChurchRecord } from '../src/lib/repo/church-admin';
import { createAdmin, findAdminByEmail } from '../src/lib/repo/admin';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> [name]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const churchRow = await getChurchRecord();
  if (!churchRow) {
    console.error('No church row found. Run `npm run db:seed` first.');
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
