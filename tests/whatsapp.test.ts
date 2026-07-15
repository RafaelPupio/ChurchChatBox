import { describe, it, expect } from 'vitest';
import {
  LIST_ROW_TITLE_MAX,
  buildImagePayload,
  buildListPayload,
  buildNumberedTextPayload,
  buildTextPayload,
} from '@/lib/whatsapp';
import type { MenuItemView } from '@/lib/types';

const items: MenuItemView[] = [
  { id: 'a', position: 2, label: '📍 Endereço', bodyText: '', imageUrl: null, isActive: true, kind: 'content' },
  { id: 'b', position: 1, label: '⛪ Horários', bodyText: '', imageUrl: null, isActive: true, kind: 'content' },
  { id: 'c', position: 3, label: '🎄 Oculto', bodyText: '', imageUrl: null, isActive: false, kind: 'content' },
];

describe('buildListPayload', () => {
  it('builds an interactive list of active items in position order', () => {
    const payload = buildListPayload('5511999', 'CABECALHO', 'BOTAO', items) as any;
    expect(payload.messaging_product).toBe('whatsapp');
    expect(payload.to).toBe('5511999');
    expect(payload.interactive.type).toBe('list');
    expect(payload.interactive.body.text).toBe('CABECALHO');
    expect(payload.interactive.action.button).toBe('BOTAO');
    expect(payload.interactive.action.sections[0].rows).toEqual([
      { id: 'b', title: '⛪ Horários' },
      { id: 'a', title: '📍 Endereço' },
    ]);
  });

  it('truncates row titles to WhatsApp\'s limit', () => {
    const long: MenuItemView[] = [
      { id: 'x', position: 1, label: 'A'.repeat(40), bodyText: '', imageUrl: null, isActive: true, kind: 'content' },
    ];
    const payload = buildListPayload('5511999', 'B', 'C', long) as any;
    expect(payload.interactive.action.sections[0].rows[0].title).toHaveLength(LIST_ROW_TITLE_MAX);
  });

  it('throws when more than 10 items are active', () => {
    const eleven: MenuItemView[] = Array.from({ length: 11 }, (_, i) => ({
      id: `i${i}`, position: i + 1, label: `Item ${i}`, bodyText: '', imageUrl: null, isActive: true, kind: 'content' as const,
    }));
    expect(() => buildListPayload('5511999', 'B', 'C', eleven)).toThrow(/10/);
  });
});

describe('buildNumberedTextPayload', () => {
  it('numbers active items and adds no invented prose', () => {
    const payload = buildNumberedTextPayload('5511999', 'CABECALHO', items) as any;
    expect(payload.type).toBe('text');
    expect(payload.text.body).toBe('CABECALHO\n\n1 - ⛪ Horários\n2 - 📍 Endereço');
  });
});

describe('buildTextPayload / buildImagePayload', () => {
  it('builds a text message', () => {
    expect(buildTextPayload('5511999', 'OI')).toEqual({
      messaging_product: 'whatsapp',
      to: '5511999',
      type: 'text',
      text: { body: 'OI' },
    });
  });

  it('builds an image message with a caption', () => {
    expect(buildImagePayload('5511999', 'LEGENDA', 'https://blob/cal.png')).toEqual({
      messaging_product: 'whatsapp',
      to: '5511999',
      type: 'image',
      image: { link: 'https://blob/cal.png', caption: 'LEGENDA' },
    });
  });
});
