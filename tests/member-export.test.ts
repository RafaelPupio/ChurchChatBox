import { describe, expect, it } from 'vitest';
import {
  EXPORT_NOTES,
  RETENTION_NOTE,
  SHARING_DISCLOSURE,
  exportFooter,
  exportHeader,
  exportMessageEntry,
  exportPrayerEntry,
  truncationNotice,
} from '@/lib/member-export';

describe('exportHeader', () => {
  it('carries the church, the subject and honest totals', () => {
    const header = exportHeader({
      churchName: 'Igreja Exemplo',
      contact: {
        name: 'Maria',
        phone: '5511999998888',
        createdAt: new Date('2026-01-04T18:22:00.000Z'),
        lastInboundAt: new Date('2026-08-01T13:40:00.000Z'),
      },
      counts: { messages: 412, prayers: 3 },
      now: new Date('2026-08-07T09:00:00.000Z'),
    });

    expect(header).toEqual({
      gerado_em: '2026-08-07T09:00:00.000Z',
      igreja: 'Igreja Exemplo',
      titular: {
        nome: 'Maria',
        whatsapp: '5511999998888',
        primeiro_registro: '2026-01-04T18:22:00.000Z',
        ultima_mensagem_recebida: '2026-08-01T13:40:00.000Z',
        total_de_mensagens: 412,
        total_de_pedidos_de_oracao: 3,
      },
    });
  });

  it('keeps a null name and a null last-inbound as null, not as ""', () => {
    // A member whose WhatsApp profile name we never saw has no name. Rendering
    // that as an empty string tells them we hold a blank, which is a different
    // and untrue statement about their data.
    const header = exportHeader({
      churchName: 'Igreja Exemplo',
      contact: { name: null, phone: '5511777776666', createdAt: new Date('2026-02-01T00:00:00.000Z'), lastInboundAt: null },
      counts: { messages: 0, prayers: 0 },
      now: new Date('2026-08-07T09:00:00.000Z'),
    });
    expect(header.titular.nome).toBeNull();
    expect(header.titular.ultima_mensagem_recebida).toBeNull();
  });
});

describe('exportMessageEntry', () => {
  it('maps direction to membro/igreja and keeps only three keys', () => {
    expect(exportMessageEntry({
      id: '7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77',
      waMessageId: 'wamid.HBgNNTUxMTk5OTk5ODg4OA==',
      direction: 'inbound',
      body: 'Oi, qual o horário do culto?',
      createdAt: new Date('2026-01-04T18:22:00.000Z'),
    })).toEqual({
      quando: '2026-01-04T18:22:00.000Z',
      de: 'membro',
      texto: 'Oi, qual o horário do culto?',
    });
  });

  it('maps outbound to igreja', () => {
    expect(exportMessageEntry({
      id: 'a', waMessageId: null, direction: 'outbound',
      body: 'Escolha uma opção:', createdAt: new Date('2026-01-04T18:22:03.000Z'),
    }).de).toBe('igreja');
  });

  it('EXCLUDES wa_message_id and the internal UUID', () => {
    // wamid values are widely reported to encode the counterpart's phone number in
    // a base64 segment. Unverifiable here (no live Meta app), so the safe
    // assumption is that it identifies the member: it means nothing to them and
    // re-exporting it would hand back an identifier inside a privacy artifact.
    const entry = exportMessageEntry({
      id: '7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77',
      waMessageId: 'wamid.HBgNNTUxMTk5OTk5ODg4OA==',
      direction: 'inbound', body: 'oi', createdAt: new Date(),
    });
    expect(Object.keys(entry).sort()).toEqual(['de', 'quando', 'texto']);
    expect(JSON.stringify(entry)).not.toContain('wamid');
    expect(JSON.stringify(entry)).not.toContain('7c1e8b2a');
  });

  it('keeps a null body as null — a media message is a real event', () => {
    // The webhook writes null for anything that is not text or a list reply. The
    // member sent something; we did not keep it. "null" says exactly that, and
    // EXPORT_NOTES explains it in words.
    expect(exportMessageEntry({
      id: 'a', waMessageId: null, direction: 'inbound', body: null, createdAt: new Date(),
    }).texto).toBeNull();
  });
});

describe('exportPrayerEntry', () => {
  it('carries when, situacao and texto only', () => {
    expect(exportPrayerEntry({
      id: 'p1',
      status: 'orado',
      text: 'meu filho faz cirurgia amanhã',
      createdAt: new Date('2026-03-02T20:10:00.000Z'),
    })).toEqual({
      quando: '2026-03-02T20:10:00.000Z',
      situacao: 'orado',
      texto: 'meu filho faz cirurgia amanhã',
    });
  });
});

describe('exportFooter', () => {
  it('carries sharing, retention and notes, and NO aviso when complete', () => {
    const footer = exportFooter({ truncatedAt: null, continuation: null });
    expect(footer.compartilhamento).toEqual(SHARING_DISCLOSURE);
    expect(footer.retencao).toBe(RETENTION_NOTE);
    // C7 is satisfied: the purge exists, so the promise may be made.
    expect(RETENTION_NOTE).toContain('12 meses');
    expect(footer.observacoes).toEqual(EXPORT_NOTES);
    expect('aviso' in footer).toBe(false);
    expect('continuacao' in footer).toBe(false);
  });

  it('gains aviso AND continuacao only when truncated', () => {
    const footer = exportFooter({
      truncatedAt: new Date('2026-03-12T19:04:11.208Z'),
      continuation: 'mensagens:2026-03-12T19:04:11.208Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77',
    });
    expect(footer.aviso).toBe(
      'Este arquivo vai até 12/03/2026. Havia mais dados do que cabe em um único arquivo — a secretaria da igreja pode gerar o restante em um segundo arquivo.',
    );
    expect(footer.continuacao).toBe('mensagens:2026-03-12T19:04:11.208Z,7c1e8b2a-4d55-4f0a-9a31-2b6c0f9e1a77');
  });

  it('names sharing explicitly — Art. 18 VII', () => {
    // The single gap that forced the Privacidade text revision: the old text did
    // not mention sharing at all.
    expect(SHARING_DISCLOSURE.join(' ')).toContain('WhatsApp');
    expect(SHARING_DISCLOSURE.join(' ')).toContain('Não vendemos');
  });

  it('never claims the copy is everything that exists', () => {
    // Deletion is bounded by our database. Meta's copy and the member's own handset
    // are outside it, and a privacy artifact that implied otherwise would be the
    // product overpromising in the one file whose job is honesty.
    expect(EXPORT_NOTES.join(' ')).toContain('WhatsApp');
    expect(EXPORT_NOTES.join(' ')).toContain('fora do controle');
  });
});

describe('truncationNotice', () => {
  it('renders a Brazilian date, not an ISO string', () => {
    expect(truncationNotice(new Date('2026-03-12T19:04:11.208Z'))).toContain('12/03/2026');
  });
});
