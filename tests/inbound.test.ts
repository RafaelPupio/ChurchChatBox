import { describe, it, expect } from 'vitest';
import { parseInbound } from '@/lib/inbound';

function envelope(message: object) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PNID' },
              contacts: [{ profile: { name: 'Maria' }, wa_id: '5511999' }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

describe('parseInbound', () => {
  it('parses a text message', () => {
    const result = parseInbound(envelope({ id: 'wamid.1', from: '5511999', type: 'text', text: { body: 'oi' } }));
    expect(result).toEqual({
      phoneNumberId: 'PNID',
      waMessageId: 'wamid.1',
      from: '5511999',
      name: 'Maria',
      message: { kind: 'text', text: 'oi' },
    });
  });

  it('parses an interactive list reply', () => {
    const result = parseInbound(envelope({
      id: 'wamid.2', from: '5511999', type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'horarios', title: '⛪ Horários' } },
    }));
    expect(result?.message).toEqual({ kind: 'list_reply', itemId: 'horarios' });
  });

  it.each(['audio', 'sticker', 'image', 'video', 'document', 'location'])('marks %s as unsupported', (type) => {
    const result = parseInbound(envelope({ id: 'wamid.3', from: '5511999', type }));
    expect(result?.message).toEqual({ kind: 'unsupported' });
  });

  it('returns null for a status-only callback', () => {
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PNID' }, statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }] };
    expect(parseInbound(payload)).toBeNull();
  });

  it.each([null, {}, { entry: [] }, { entry: [{ changes: [] }] }])('returns null for malformed payload %j', (payload) => {
    expect(parseInbound(payload)).toBeNull();
  });
});
