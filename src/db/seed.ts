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
  const existing = await db.select().from(church).limit(1);

  if (existing.length > 0) {
    console.log(`Church already seeded (${existing[0].name}) — nothing to do.`);
    return;
  }

  const [created] = await db.insert(church).values(CHURCH_DEFAULTS).returning();
  console.log(`Created church ${created.id}`);

  await db.insert(menuItem).values(
    MENU_SEED.map((item) => ({ ...item, churchId: created.id })),
  );
  console.log(`Inserted ${MENU_SEED.length} menu items`);

  const rows = await db.select().from(menuItem).where(eq(menuItem.churchId, created.id));
  console.log(`Verified ${rows.length} rows in the menu.`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
