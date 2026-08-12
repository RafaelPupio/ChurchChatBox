import { describe, expect, it } from 'vitest';
import { PRIVACY_ITEM, PRIVACY_ITEM_PREVIOUS_BODIES } from '@/lib/church-defaults';
import { CHURCH_TEXT_MAX } from '@/lib/validation';

describe('the Privacidade text v2', () => {
  const body = PRIVACY_ITEM.bodyText;

  it('names sharing — the Art. 18 VII gap that forced this revision', () => {
    expect(body).toContain('Com quem compartilhamos');
    expect(body).toContain('WhatsApp');
    expect(body).toContain('Não vendemos');
  });

  it('promises the 12-month purge for conversations AND prayer requests', () => {
    expect(body).toContain('as conversas e os pedidos de oração são apagados automaticamente após 12 meses');
  });

  it('states that deletion does not block future contact', () => {
    // Members must not believe deletion is a permanent block. It is not, and the
    // no-blocklist decision means it never will be.
    expect(body).toContain('um novo histórico começa');
  });

  it('NEVER claims LGPD compliance, and does not name the statute at all', () => {
    // The distinction between "we comply with the LGPD" and "your data is handled
    // in accordance with the LGPD" is real to a lawyer and invisible to a member
    // reading it on a phone.
    expect(body).not.toContain('LGPD');
    expect(body).not.toContain('13.709');
    expect(body.toLowerCase()).not.toContain('conformidade');
  });

  it('does not address the secretary in text members read', () => {
    expect(body).not.toContain('Edite este texto');
  });

  it('never uses the word dízimo', () => {
    expect(body.toLowerCase()).not.toContain('dízimo');
    expect(body.toLowerCase()).not.toContain('dizimo');
  });

  it('fits under CHURCH_TEXT_MAX, the tightest cap any bot text hits', () => {
    // 1024 is not an "image-caption cap" — that is how the spec describes it and it
    // is wrong. It is src/lib/validation.ts:7's CHURCH_TEXT_MAX: Meta's interactive
    // list caps `body.text` at 1024 and plain text at 4096, so 1024 is the tightest
    // limit any of these values hits. The real reason is stronger than the one the
    // spec gives, because it binds whether or not a church attaches an image.
    expect(body.length).toBeLessThan(CHURCH_TEXT_MAX);
  });

  it('freezes every previous default so the rollout can recognise an unedited row', () => {
    expect(PRIVACY_ITEM_PREVIOUS_BODIES.length).toBeGreaterThanOrEqual(2);
    // The current body is not one of the "previous" ones.
    expect(PRIVACY_ITEM_PREVIOUS_BODIES).not.toContain(body);
    // Every frozen body is distinct — a duplicate means one was mis-transcribed.
    expect(new Set(PRIVACY_ITEM_PREVIOUS_BODIES).size).toBe(PRIVACY_ITEM_PREVIOUS_BODIES.length);
  });
});
