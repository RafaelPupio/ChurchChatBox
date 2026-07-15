import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { church, menuItem } from './schema';

const EDIT_HINT = '\n\n_Edite este texto no painel._';

const CHURCH_DEFAULTS = {
  name: 'Minha Igreja',
  greetingText: 'Olá! 🙏 Sou a secretária virtual da igreja. Como posso te ajudar?',
  menuHeaderText: 'Escolha uma opção:',
  menuButtonLabel: 'Ver opções',
  fallbackText: 'Desculpe, não entendi. 🙏 Escolha uma das opções abaixo:',
  unsupportedMediaText: 'Por enquanto eu entendo apenas texto e as opções do menu. 🙏',
  errorText: 'Estamos com uma instabilidade no momento. Por favor, tente novamente em instantes 🙏',
  prayerPromptText: 'Pode escrever seu pedido de oração 🙏 Vamos orar por você!',
  prayerThanksText: 'Recebemos seu pedido! ❤️ Nossa equipe estará orando por você.',
  handoffText: 'Um momento! 😊 Alguém da secretaria vai te atender por aqui em breve.',
  handoffClosedText: 'Atendimento encerrado. Se precisar de mais alguma coisa, é só chamar! 🙏',
} as const;

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

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
