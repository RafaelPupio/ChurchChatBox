import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { church, menuItem } from './schema';
import { CHURCH_DEFAULTS } from '@/lib/church-defaults';

const EDIT_HINT = '\n\n_Edite este texto no painel._';

// LOCAL DEVELOPMENT FIXTURE ONLY — never run this against production.
//
// It picks "the" church with an unordered `select().from(church).limit(1)`, which
// was written when exactly one church could exist. On a multi-tenant database
// that row is arbitrary: on a populated DB it can graft this 9-item dev menu onto
// whichever real church happens to have an empty menu, and on an empty one it
// creates a church with no admin and no Privacidade item, bypassing
// provisionChurch() (the single supported path into existence) entirely.
//
// Real churches are created by provisionChurch(), via the owner console or
// `npm run create-church`. The NODE_ENV guard in main() enforces that.
const MENU_SEED = [
  { position: 1, label: '⛪ Horários de Culto', kind: 'content' as const, bodyText: '*Horários de Culto*' + EDIT_HINT },
  { position: 2, label: '📍 Endereço e Contato', kind: 'content' as const, bodyText: '*Endereço e Contato*' + EDIT_HINT },
  { position: 3, label: '📅 Agenda de Eventos', kind: 'content' as const, bodyText: '*Agenda de Eventos*' + EDIT_HINT },
  { position: 4, label: '🗓️ Calendário do Mês', kind: 'content' as const, bodyText: '*Calendário do Mês*\n\nEnvie a imagem do calendário pelo painel.' + EDIT_HINT },
  { position: 5, label: '🔥 OTB Jovens', kind: 'content' as const, bodyText: '*OTB Jovens*' + EDIT_HINT },
  { position: 6, label: '👥 GD Adultos', kind: 'content' as const, bodyText: '*GD Adultos*' + EDIT_HINT },
  { position: 7, label: '💚 Ofertas', kind: 'content' as const, bodyText: '*Ofertas*\n\nSua oferta abençoa a obra da nossa igreja. Que Deus recompense seu coração generoso! 🙏\n\n*PIX:* (cadastre a chave no painel)' + EDIT_HINT },
  { position: 8, label: '🙏 Pedido de Oração', kind: 'prayer' as const, bodyText: '' },
  { position: 9, label: '💬 Falar com Atendente', kind: 'human' as const, bodyText: '' },
];

// Church and menu are checked independently on purpose. The neon-http driver has
// no transaction support, so these two inserts cannot be atomic: if the menu
// insert fails, the church row survives with zero menu rows. A guard that only
// looked for the church would then report "already seeded" forever and never
// repair it, leaving members staring at an empty menu. Checking each separately
// means a rerun finishes the job.
async function seed() {
  // Step 1: Ensure church exists (idempotent)
  let churchRow = null;
  const existing = await db.select().from(church).limit(1);

  if (existing.length > 0) {
    churchRow = existing[0];
    console.log(`Using existing church: ${churchRow.name}`);
  } else {
    const [created] = await db.insert(church).values(CHURCH_DEFAULTS).returning();
    churchRow = created;
    console.log(`Created church: ${churchRow.name} (id: ${churchRow.id})`);
  }

  // Step 2: Check and ensure menu items (independently idempotent)
  const menuItems = await db.select().from(menuItem).where(eq(menuItem.churchId, churchRow.id));

  if (menuItems.length === 0) {
    // Menu is missing or incomplete from a prior partial failure — insert all items
    await db.insert(menuItem).values(
      MENU_SEED.map((item) => ({ ...item, churchId: churchRow.id })),
    );
    console.log(`Inserted ${MENU_SEED.length} menu items`);
  } else {
    // Menu exists; respect any staff edits
    console.log(`Church already has ${menuItems.length} menu items — no changes made`);
  }

  // Final summary
  const finalMenuCount = menuItems.length === 0 ? MENU_SEED.length : menuItems.length;
  console.log(`Seed complete: church "${churchRow.name}" with ${finalMenuCount} menu items`);
}

async function main() {
  // Refuse outright in production. This script writes to an arbitrarily chosen
  // church row; there is no safe way to run it against real tenants.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'src/db/seed.ts is a local development fixture and refuses to run with NODE_ENV=production. ' +
        'Create real churches with the owner console or `npm run create-church`.',
    );
  }
  await seed();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
