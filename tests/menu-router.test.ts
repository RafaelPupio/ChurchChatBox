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
