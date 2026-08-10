import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LIST_ROW_TITLE_MAX,
  MenuEmptyError,
  MenuTooLongError,
  buildImagePayload,
  buildListPayload,
  buildNumberedTextPayload,
  buildTextPayload,
  sendReply,
  truncateRowTitle,
} from '@/lib/whatsapp';
import type { ChurchConfig, MenuItemView, Reply } from '@/lib/types';

/** No lone (unpaired) UTF-16 surrogate anywhere in the string. */
function hasNoUnpairedSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
    const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;
    if (isHighSurrogate) {
      const next = value.charCodeAt(i + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
      i++; // consumed the paired low surrogate
    } else if (isLowSurrogate) {
      return false; // low surrogate not preceded by a high surrogate
    }
  }
  return true;
}

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

  it('throws a MenuTooLongError when more than 10 items are active', () => {
    const eleven: MenuItemView[] = Array.from({ length: 11 }, (_, i) => ({
      id: `i${i}`, position: i + 1, label: `Item ${i}`, bodyText: '', imageUrl: null, isActive: true, kind: 'content' as const,
    }));
    expect(() => buildListPayload('5511999', 'B', 'C', eleven)).toThrow(/10/);
    expect(() => buildListPayload('5511999', 'B', 'C', eleven)).toThrow(MenuTooLongError);
  });

  it('throws a MenuEmptyError instead of silently returning a zero-row payload', () => {
    const none: MenuItemView[] = [
      { id: 'x', position: 1, label: 'Hidden', bodyText: '', imageUrl: null, isActive: false, kind: 'content' },
    ];
    expect(() => buildListPayload('5511999', 'B', 'C', none)).toThrow(MenuEmptyError);
    // Also true for a wholly empty items array (unseeded church).
    expect(() => buildListPayload('5511999', 'B', 'C', [])).toThrow(MenuEmptyError);
  });
});

describe('truncateRowTitle', () => {
  it('returns the label unchanged when it already fits', () => {
    expect(truncateRowTitle('💚 Ofertas')).toBe('💚 Ofertas');
  });

  it('truncates a long ASCII label to exactly the code-unit limit', () => {
    const result = truncateRowTitle('A'.repeat(40));
    expect(result).toHaveLength(LIST_ROW_TITLE_MAX);
    expect(result).toBe('A'.repeat(LIST_ROW_TITLE_MAX));
  });

  it('never splits a surrogate pair sitting on the 24-code-unit boundary', () => {
    // 23 'A's put the next grapheme (a 2-code-unit emoji) starting right at index 23,
    // straddling the old slice(0, 24) cut point.
    const label = 'A'.repeat(23) + '📍' + 'B'.repeat(10);
    const result = truncateRowTitle(label);
    expect(result.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX);
    expect(hasNoUnpairedSurrogate(result)).toBe(true);
  });

  it('truncates an emoji-only label without breaking a glyph', () => {
    const label = '📍'.repeat(20);
    const result = truncateRowTitle(label);
    expect(result.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX);
    expect(hasNoUnpairedSurrogate(result)).toBe(true);
    // Every grapheme kept should be a whole 📍, never a fragment.
    expect(result).toBe('📍'.repeat(Math.floor(result.length / 2)));
  });
});

describe('sendReply — menu send fallback', () => {
  const config: ChurchConfig = {
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
  const creds = { phoneNumberId: '123', accessToken: 'token' };
  const menuReply: Reply = { type: 'menu', bodyText: 'CABECALHO' };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to numbered text only when the menu exceeds the row limit', async () => {
    const eleven: MenuItemView[] = Array.from({ length: 11 }, (_, i) => ({
      id: `i${i}`, position: i + 1, label: `Item ${i}`, bodyText: '', imageUrl: null, isActive: true, kind: 'content' as const,
    }));

    await sendReply(creds, '5511999', menuReply, config, eleven);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('text');
    expect(body.text.body).toContain('11 - Item 10');
  });

  it('does not retry and propagates a Graph API failure untouched', async () => {
    const items: MenuItemView[] = [
      { id: 'a', position: 1, label: '⛪ Horários', bodyText: '', imageUrl: null, isActive: true, kind: 'content' },
    ];
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid token' });

    await expect(sendReply(creds, '5511999', menuReply, config, items)).rejects.toThrow(/401/);

    // Must not have retried with the numbered fallback — a single failed call only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the body text only, and warns, when there are zero active items', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await sendReply(creds, '5511999', menuReply, config, []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('CABECALHO');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
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
