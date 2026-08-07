import 'dotenv/config';
import { createOwner, findOwnerByEmail } from '../src/lib/repo/owner';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npm run create-owner -- <email> <password> [name]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }
  if (await findOwnerByEmail(email)) {
    console.error(`An owner with email ${email} already exists.`);
    process.exitCode = 1;
    return;
  }

  await createOwner({ email, passwordHash: await hashPassword(password), name: name ?? null });
  console.log(`Owner created: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
