import 'dotenv/config';
import { provisionChurch } from '../src/lib/provisioning';

async function main() {
  const [name, adminEmail, password] = process.argv.slice(2);

  if (!name || !adminEmail || !password) {
    console.error('Usage: npm run create-church -- <name> <adminEmail> <password>');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const { churchId, adminUserId } = await provisionChurch(name, adminEmail, password);
  console.log(`Church created: ${name}`);
  console.log(`  church id: ${churchId}`);
  console.log(`  admin:     ${adminEmail} (${adminUserId})`);
  console.log('Connect its WhatsApp number from the owner console at /owner.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
