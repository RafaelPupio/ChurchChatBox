import { describe, it, expect } from 'vitest';
import { route } from '@/lib/menu-router';
import type { ChurchConfig, MenuItemView } from '@/lib/types';

export const config: ChurchConfig = {
  id: 'church-1',
  name: 'Igreja Teste',
  greetingText: 'SAUDACAO',
  menuHeaderText: 'CABECALHO',
  menuButtonLabel: 'BOTAO',
  fallbackText: 'NAO_ENTENDI',
  unsupportedMediaText: 'SO_TEXTO',
  errorText: 'INSTABILIDADE',
  prayerPromptText: 'ESCREVA_PEDIDO',
  prayerThanksText: 'RECEBEMOS',
  handoffText: 'UM_MOMENTO',
  handoffClosedText: 'ENCERRADO',
  courtesyText: 'DEUS_ABENCOE',
};

export const items: MenuItemView[] = [
  { id: 'horarios', position: 1, label: '⛪ Horários', bodyText: 'CULTOS', imageUrl: null, isActive: true, kind: 'content' },
  { id: 'calendario', position: 2, label: '🗓️ Calendário', bodyText: 'CALENDARIO', imageUrl: 'https://blob/cal.png', isActive: true, kind: 'content' },
  { id: 'oculto', position: 3, label: '🎄 Cantata', bodyText: 'NATAL', imageUrl: null, isActive: false, kind: 'content' },
  { id: 'oracao', position: 4, label: '🙏 Oração', bodyText: '', imageUrl: null, isActive: true, kind: 'prayer' },
  { id: 'atendente', position: 5, label: '💬 Atendente', bodyText: '', imageUrl: null, isActive: true, kind: 'human' },
];

const base = { config, items, mode: 'bot' as const, isFirstContact: false };

describe('route — menu rendering', () => {
  it('greets a first contact and shows the menu', () => {
    const result = route({ ...base, isFirstContact: true, message: { kind: 'text', text: 'oi' } });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'SAUDACAO' }]);
    expect(result.nextMode).toBe('bot');
  });

  it('uses the fallback text for unrecognized input from a known contact', () => {
    const result = route({ ...base, message: { kind: 'text', text: 'qualquer coisa' } });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'NAO_ENTENDI' }]);
  });

  it.each(['menu', 'voltar', '0', ' MENU ', 'Voltar'])('treats %j as an escape hatch', (text) => {
    const result = route({ ...base, message: { kind: 'text', text } });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'CABECALHO' }]);
    expect(result.nextMode).toBe('bot');
  });
});

describe('route — content items', () => {
  it('replies with the item body then the menu, on list tap', () => {
    const result = route({ ...base, message: { kind: 'list_reply', itemId: 'horarios' } });
    expect(result.replies).toEqual([
      { type: 'text', body: 'CULTOS' },
      { type: 'menu', bodyText: 'CABECALHO' },
    ]);
  });

  it('sends an image reply when the item has an image', () => {
    const result = route({ ...base, message: { kind: 'list_reply', itemId: 'calendario' } });
    expect(result.replies[0]).toEqual({ type: 'image', body: 'CALENDARIO', imageUrl: 'https://blob/cal.png' });
  });

  it('selects by number using active sorted position', () => {
    const result = route({ ...base, message: { kind: 'text', text: '2' } });
    expect(result.replies[0]).toEqual({ type: 'image', body: 'CALENDARIO', imageUrl: 'https://blob/cal.png' });
  });

  it('never serves a hidden item, by tap or by number', () => {
    const byTap = route({ ...base, message: { kind: 'list_reply', itemId: 'oculto' } });
    expect(byTap.replies).toEqual([{ type: 'menu', bodyText: 'NAO_ENTENDI' }]);

    // '3' is now the prayer item, not the hidden Cantata at position 3
    const byNumber = route({ ...base, message: { kind: 'text', text: '3' } });
    expect(byNumber.replies).toEqual([{ type: 'text', body: 'ESCREVA_PEDIDO' }]);
  });

  it('falls back to the menu for an out-of-range number', () => {
    const result = route({ ...base, message: { kind: 'text', text: '99' } });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'NAO_ENTENDI' }]);
  });

  it.each(['+1', '0x1', '1e0', '1.5', '-1', ' ', '', 'Infinity', 'NaN'])(
    'rejects non-canonical numeric form %j and falls back to menu',
    (text) => {
      const result = route({ ...base, message: { kind: 'text', text } });
      expect(result.replies).toEqual([{ type: 'menu', bodyText: 'NAO_ENTENDI' }]);
      expect(result.nextMode).toBe('bot');
    }
  );
});

describe('route — prayer flow', () => {
  it('prompts for the request when the prayer item is tapped', () => {
    const result = route({ ...base, message: { kind: 'list_reply', itemId: 'oracao' } });
    expect(result.replies).toEqual([{ type: 'text', body: 'ESCREVA_PEDIDO' }]);
    expect(result.nextMode).toBe('awaiting_prayer');
    expect(result.prayerRequestText).toBeUndefined();
  });

  it('captures the next message as the request and thanks the sender', () => {
    const result = route({
      ...base,
      mode: 'awaiting_prayer',
      message: { kind: 'text', text: '  Orem pela minha mãe  ' },
    });
    expect(result.prayerRequestText).toBe('Orem pela minha mãe');
    expect(result.replies).toEqual([{ type: 'text', body: 'RECEBEMOS' }]);
    expect(result.nextMode).toBe('bot');
  });

  it('saves a request even when it looks like a menu number', () => {
    const result = route({ ...base, mode: 'awaiting_prayer', message: { kind: 'text', text: '1' } });
    expect(result.prayerRequestText).toBe('1');
    expect(result.nextMode).toBe('bot');
  });

  it('cancels the prayer when an escape word is typed', () => {
    const result = route({ ...base, mode: 'awaiting_prayer', message: { kind: 'text', text: 'menu' } });
    expect(result.prayerRequestText).toBeUndefined();
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'CABECALHO' }]);
    expect(result.nextMode).toBe('bot');
  });

  it('cancels the prayer when a menu item is tapped instead', () => {
    const result = route({ ...base, mode: 'awaiting_prayer', message: { kind: 'list_reply', itemId: 'horarios' } });
    expect(result.prayerRequestText).toBeUndefined();
    expect(result.replies[0]).toEqual({ type: 'text', body: 'CULTOS' });
    expect(result.nextMode).toBe('bot');
  });

  it.each(['', '   ', '\t', '\n'])('re-prompts instead of capturing whitespace-only input %j', (text) => {
    const result = route({
      ...base,
      mode: 'awaiting_prayer',
      message: { kind: 'text', text },
    });
    expect(result.prayerRequestText).toBeUndefined();
    expect(result.replies).toEqual([{ type: 'text', body: 'ESCREVA_PEDIDO' }]);
    expect(result.nextMode).toBe('awaiting_prayer');
  });

  it('regression: captures non-empty prayer with surrounding whitespace trimmed', () => {
    const result = route({
      ...base,
      mode: 'awaiting_prayer',
      message: { kind: 'text', text: '  Orem pela cura  ' },
    });
    expect(result.prayerRequestText).toBe('Orem pela cura');
    expect(result.replies).toEqual([{ type: 'text', body: 'RECEBEMOS' }]);
    expect(result.nextMode).toBe('bot');
  });
});

/** The conversation that produced this branch: a member asked for prayer for her
 *  hospitalised mother, the bot confirmed, she wrote "obrigada!" — and was told
 *  "Desculpe, não entendi." Correct, and cold at the tenderest moment the product
 *  has. These tests pin BOTH halves: that gratitude is answered warmly once, and
 *  that nothing else is swallowed by the attempt. */
describe('route — courtesy reply', () => {
  it('answers "obrigada!" once, warmly, and does not re-push the menu', () => {
    const result = route({ ...base, message: { kind: 'text', text: 'obrigada!' } });
    expect(result.replies).toEqual([{ type: 'text', body: 'DEUS_ABENCOE' }]);
    expect(result.nextMode).toBe('bot');
    expect(result.prayerRequestText).toBeUndefined();
  });

  it.each([
    'obrigado', 'Obrigada', 'OBRIGADA!!!', 'obrigada 🙏', '  obrigada  ',
    'obrigadão', 'obrigadao', 'obrigadinha', 'obrigadinho',
    'brigado', 'brigada', 'obg', 'obg!', 'obgd',
    'muito obrigada', 'Muito obrigado!', 'valeu', 'vlw', 'gratidão', 'gratidao',
    'amém', 'amem', 'Amém 🙏🙏', 'amém!',
    'Deus abençoe', 'deus abencoe', 'Deus te abençoe!', 'que Deus abençoe você',
    'Que Deus abençoe vocês', 'Deus abençoe a todos',
    // Two courtesy words together is still just courtesy.
    'amém, obrigada!', 'obrigada, amém', 'valeu, obrigado',
  ])('recognises %j as gratitude or blessing', (text) => {
    const result = route({ ...base, message: { kind: 'text', text } });
    expect(result.replies).toEqual([{ type: 'text', body: 'DEUS_ABENCOE' }]);
    expect(result.nextMode).toBe('bot');
  });

  it.each([
    // Acknowledgements, not gratitude — a blessing in reply to "ok" is odd.
    'ok', 'okay', 'blz', 'beleza', 'entendi', 'certo', 'sim', 'tá bom', 'legal', 'show',
    // Greetings are not closings: "boa noite" opens most Brazilian messages.
    'boa noite', 'bom dia', 'oi', 'tchau',
    // Bare emoji and empty-ish input carry no words to recognise.
    '🙏', '👍',
    // Gratitude used inside a sentence that means something else.
    'valeu a pena', 'obrigada a todos que vieram ontem, foi lindo',
    // A digit is a menu choice in this bot, so it must survive the fold and
    // keep the message out of the courtesy branch.
    'obrigada 1', '2 obrigada',
  ])('does not treat %j as courtesy', (text) => {
    const result = route({ ...base, message: { kind: 'text', text } });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'NAO_ENTENDI' }]);
    expect(result.nextMode).toBe('bot');
  });

  it('does not swallow a real question that happens to start with "obrigada"', () => {
    // THE case that decides exact-match over contains-match. She still needs an
    // answer, so she must still get the menu.
    const result = route({
      ...base,
      message: { kind: 'text', text: 'obrigada, mas qual o horário do culto?' },
    });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'NAO_ENTENDI' }]);
  });

  it.each(['obrigada', 'amém', 'Deus abençoe'])(
    'stays silent in human mode for %j — she is talking to a person',
    (text) => {
      const result = route({ ...base, mode: 'human', message: { kind: 'text', text } });
      expect(result.replies).toEqual([]);
      expect(result.nextMode).toBe('human');
    },
  );

  it('captures a bare "obrigada" as the prayer request while awaiting one', () => {
    // She was asked to write. Whatever she writes is the request — capturing it
    // is the whole point of the state.
    const result = route({ ...base, mode: 'awaiting_prayer', message: { kind: 'text', text: 'obrigada' } });
    expect(result.prayerRequestText).toBe('obrigada');
    expect(result.replies).toEqual([{ type: 'text', body: 'RECEBEMOS' }]);
    expect(result.nextMode).toBe('bot');
  });

  it('captures a prayer that merely contains "obrigada"', () => {
    const text = 'Obrigada por orarem pela minha mãe, ela está internada';
    const result = route({ ...base, mode: 'awaiting_prayer', message: { kind: 'text', text } });
    expect(result.prayerRequestText).toBe(text);
    expect(result.replies).toEqual([{ type: 'text', body: 'RECEBEMOS' }]);
  });

  it.each(['menu', 'voltar', '0'])('never pre-empts the escape word %j', (text) => {
    const result = route({ ...base, message: { kind: 'text', text } });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'CABECALHO' }]);
  });

  it('greets a first contact rather than blessing them into a dead end', () => {
    // Someone whose first ever message is "amém" has never seen the menu. A
    // blessing with no menu would leave them with nowhere to go.
    const result = route({ ...base, isFirstContact: true, message: { kind: 'text', text: 'amém' } });
    expect(result.replies).toEqual([{ type: 'menu', bodyText: 'SAUDACAO' }]);
    expect(result.greeted).toBe(true);
  });

  it('does not change what a menu number does', () => {
    const result = route({ ...base, message: { kind: 'text', text: '1' } });
    expect(result.replies[0]).toEqual({ type: 'text', body: 'CULTOS' });
  });
});

describe('route — human handoff', () => {
  it('announces the handoff and switches to human mode', () => {
    const result = route({ ...base, message: { kind: 'list_reply', itemId: 'atendente' } });
    expect(result.replies).toEqual([{ type: 'text', body: 'UM_MOMENTO' }]);
    expect(result.nextMode).toBe('human');
  });

  it.each([
    { kind: 'text' as const, text: 'oi' },
    { kind: 'text' as const, text: 'menu' },
    { kind: 'list_reply' as const, itemId: 'horarios' },
    { kind: 'unsupported' as const },
  ])('stays completely silent in human mode for %j', (message) => {
    const result = route({ ...base, mode: 'human', message });
    expect(result.replies).toEqual([]);
    expect(result.nextMode).toBe('human');
    expect(result.prayerRequestText).toBeUndefined();
  });
});

describe('route — unsupported media', () => {
  it('explains and re-offers the menu', () => {
    const result = route({ ...base, message: { kind: 'unsupported' } });
    expect(result.replies).toEqual([
      { type: 'text', body: 'SO_TEXTO' },
      { type: 'menu', bodyText: 'CABECALHO' },
    ]);
    expect(result.nextMode).toBe('bot');
  });

  it('does not capture media as a prayer request', () => {
    const result = route({ ...base, mode: 'awaiting_prayer', message: { kind: 'unsupported' } });
    expect(result.prayerRequestText).toBeUndefined();
    expect(result.nextMode).toBe('awaiting_prayer');
  });
});
