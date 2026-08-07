import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * "A suspended church gets a silent bot" is the headline of this branch, and the
 * early return that implements it had no executable coverage — a refactor that
 * moved it below the send loop would still typecheck and still pass every other
 * test, while every member of a suspended church kept getting bot replies.
 *
 * Runs the real route handler against PGlite. Only the Graph API is stubbed
 * (there is no Meta app to call); verifySignature stays real, so the payloads
 * below are genuinely HMAC-signed with the church's app_secret.
 */

type SentReply = { type: string; bodyText?: string; body?: string };

const h = vi.hoisted(() => ({
  sent: [] as { kind: 'reply' | 'text'; to: string; reply?: SentReply }[],
  /** Set to make the next sendReply throw once, then clear itself. Models a Graph
   *  API failure, which is the non-suspension half of both bugs: a greeting or a
   *  prayer confirmation that never leaves must not be recorded as delivered. */
  throwOnNextSend: false,
}));

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__webhookClient = client;
  return { db: drizzle(client, { schema }) };
});

vi.mock('@/lib/whatsapp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp')>();
  return {
    ...actual, // verifySignature and the payload builders stay real
    sendReply: async (_c: unknown, to: string, reply: SentReply) => {
      if (h.throwOnNextSend) {
        h.throwOnNextSend = false;
        throw new Error('Graph API unavailable');
      }
      h.sent.push({ kind: 'reply', to, reply });
    },
    sendText: async (_c: unknown, to: string) => {
      h.sent.push({ kind: 'text', to });
    },
  };
});

const { POST } = await import('@/app/api/whatsapp/webhook/route');
const { NextRequest } = await import('next/server');

const APP_SECRET = 'segredo-do-app';
const PHONE_NUMBER_ID = 'PNID_SUSPENSAO';
const MEMBER = '5511999990000';

let client: PGlite;
let churchId: string;
let prayerItemId: string;
let humanItemId: string;

/** `from` defaults to MEMBER so every pre-existing call is untouched. Greeting
 *  tests MUST pass a fresh number: the active-church test below already gave
 *  MEMBER a reply, so reusing it would assert against an already-greeted contact
 *  and pass for the wrong reason. */
function payload(waMessageId: string, text: string, from: string = MEMBER): string {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name: 'Membro' } }],
              messages: [{ id: waMessageId, from, type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
}

/** A menu list tap, matching what parseInbound expects. */
function listPayload(waMessageId: string, itemId: string, title: string, from: string): string {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name: 'Membro' } }],
              messages: [
                {
                  id: waMessageId,
                  from,
                  type: 'interactive',
                  interactive: { type: 'list_reply', list_reply: { id: itemId, title } },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

/** Each test that must start from a never-greeted contact gets its own number. */
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `55119888${String(phoneCounter).padStart(5, '0')}`;
}

async function setMode(phone: string, mode: string, modeChangedAt?: Date) {
  await client.query(
    'update contact set mode = $1, mode_changed_at = coalesce($2, mode_changed_at) where church_id = $3 and phone = $4',
    [mode, modeChangedAt ?? null, churchId, phone],
  );
}

async function contactRow(phone: string) {
  const r = await client.query<{ mode: string; greeted_at: Date | null; mode_changed_at: Date }>(
    'select mode, greeted_at, mode_changed_at from contact where church_id = $1 and phone = $2',
    [churchId, phone],
  );
  return r.rows[0];
}

async function prayerCount(phone: string): Promise<number> {
  const r = await client.query<{ n: number }>(
    `select count(*)::int as n from prayer_request p
     join contact c on c.id = p.contact_id
     where c.church_id = $1 and c.phone = $2`,
    [churchId, phone],
  );
  return r.rows[0].n;
}

async function post(body: string): Promise<Response> {
  const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex');
  return POST(
    new NextRequest('http://localhost/api/whatsapp/webhook', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': signature, 'content-type': 'application/json' },
    }),
  );
}

async function setStatus(status: 'active' | 'past_due' | 'suspended', graceUntil: Date | null) {
  await client.query('update church set status = $1, grace_until = $2 where id = $3', [
    status,
    graceUntil,
    churchId,
  ]);
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__webhookClient as PGlite;
  const dir = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  const c = await client.query<{ id: string }>(
    `insert into church (name,phone_number_id,access_token,app_secret,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ('Igreja Suspensa',$1,'token',$2,'Olá!','Escolha:','Ver opções','Não entendi','Só texto','Erro','Escreva','Recebemos','Um momento','Encerrado') returning id`,
    [PHONE_NUMBER_ID, APP_SECRET],
  );
  churchId = c.rows[0].id;

  await client.query(
    `insert into menu_item (church_id,position,label,body_text,is_active,kind)
     values ($1,1,'⛪ Horários','Domingo 18h',true,'content')`,
    [churchId],
  );

  const p = await client.query<{ id: string }>(
    `insert into menu_item (church_id,position,label,body_text,is_active,kind)
     values ($1,2,'🙏 Pedido de Oração','',true,'prayer') returning id`,
    [churchId],
  );
  prayerItemId = p.rows[0].id;

  const hu = await client.query<{ id: string }>(
    `insert into menu_item (church_id,position,label,body_text,is_active,kind)
     values ($1,3,'💬 Falar com Atendente','',true,'human') returning id`,
    [churchId],
  );
  humanItemId = hu.rows[0].id;
});

beforeEach(() => {
  h.sent.length = 0;
  h.throwOnNextSend = false;
});

describe('webhook suspension gate', () => {
  it('replies to a member of an active church', async () => {
    await setStatus('active', null);

    const response = await post(payload('wamid.ativa.1', 'oi'));

    expect(response.status).toBe(200);
    expect(h.sent).not.toHaveLength(0);
    expect(h.sent.every((s) => s.to === MEMBER)).toBe(true);
  });

  it('sends nothing at all for a suspended church', async () => {
    await setStatus('suspended', null);

    const response = await post(payload('wamid.suspensa.1', 'oi'));

    // Always 200: a non-200 makes Meta retry, and a retry means a duplicate reply.
    expect(response.status).toBe(200);
    expect(h.sent).toEqual([]);
  });

  it('still records the inbound message and the reply window while suspended', async () => {
    await setStatus('suspended', null);

    const countOutbound = async (): Promise<number> => {
      const r = await client.query<{ n: number }>(
        "select count(*)::int as n from message where church_id = $1 and direction = 'outbound'",
        [churchId],
      );
      return r.rows[0].n;
    };
    const outboundBefore = await countOutbound();

    await post(payload('wamid.suspensa.2', 'estou aqui'));

    // Suspension silences the bot; it does not drop member state. The message
    // history and the 24h window must be accurate the moment the church is
    // reactivated, and nothing a member wrote may be lost.
    const messages = await client.query<{ body: string; direction: string }>(
      'select body, direction from message where wa_message_id = $1',
      ['wamid.suspensa.2'],
    );
    expect(messages.rows).toHaveLength(1);
    expect(messages.rows[0].body).toBe('estou aqui');
    expect(messages.rows[0].direction).toBe('inbound');

    const contacts = await client.query<{ last_inbound_at: Date | null }>(
      'select last_inbound_at from contact where church_id = $1 and phone = $2',
      [churchId, MEMBER],
    );
    expect(contacts.rows[0].last_inbound_at).not.toBeNull();

    // Snapshotted around THIS request. A bare `> 0` would have been satisfied by
    // the outbound rows the active-church test left behind, so it would pass even
    // if a suspended church replied.
    expect(await countOutbound()).toBe(outboundBefore);
  });

  it('keeps replying while a past_due church is inside its grace period', async () => {
    await setStatus('past_due', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

    await post(payload('wamid.carencia.1', 'oi'));

    expect(h.sent).not.toHaveLength(0);
  });

  it('goes silent once a past_due grace period has expired', async () => {
    await setStatus('past_due', new Date(Date.now() - 60 * 1000));

    await post(payload('wamid.carencia.2', 'oi'));

    expect(h.sent).toEqual([]);
  });
});

/**
 * Suspension must stop the church from SENDING, never from RECORDING. The first
 * implementation returned early before the router ran, which also skipped the
 * greeting bookkeeping and the prayer capture — so a member who arrived during
 * suspension was silently damaged in two ways that only surfaced after the church
 * paid and came back.
 */
describe('suspension records everything it cannot send', () => {
  it('greets a member who first wrote while the church was suspended', async () => {
    const phone = freshPhone();
    await setStatus('suspended', null);

    await post(payload('wamid.saudacao.1', 'oi', phone));
    expect(h.sent).toEqual([]);

    await setStatus('active', null);
    await post(payload('wamid.saudacao.2', 'oi', phone));

    // The greeting, not the "não entendi" fallback. Before the fix, isFirstContact
    // was burned by the row creation during suspension and this was 'Não entendi'
    // forever.
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].reply?.bodyText).toBe('Olá!');

    const out = await client.query<{ body: string }>(
      `select m.body from message m join contact c on c.id = m.contact_id
       where c.phone = $1 and m.direction = 'outbound' order by m.created_at desc limit 1`,
      [phone],
    );
    expect(out.rows[0].body).toBe('Olá!');
  });

  it('greets exactly once — the next message gets the fallback', async () => {
    const phone = freshPhone();
    await setStatus('active', null);

    await post(payload('wamid.saudacao.3', 'oi', phone));
    expect(h.sent[0].reply?.bodyText).toBe('Olá!');

    h.sent.length = 0;
    await post(payload('wamid.saudacao.4', 'blablabla', phone));
    expect(h.sent[0].reply?.bodyText).toBe('Não entendi');
  });

  it('does not burn the greeting when the send itself fails at an active church', async () => {
    const phone = freshPhone();
    await setStatus('active', null);

    h.throwOnNextSend = true;
    await post(payload('wamid.falha.1', 'oi', phone));

    // The apology fired, and greeted_at was NOT written — the greeting never left.
    expect(h.sent.some((s) => s.kind === 'text')).toBe(true);
    expect((await contactRow(phone)).greeted_at).toBeNull();

    h.sent.length = 0;
    await post(payload('wamid.falha.2', 'oi', phone));
    expect(h.sent[0].reply?.bodyText).toBe('Olá!');
  });

  it('greets a member whose first message was a menu tap, on their next message', async () => {
    // Deliberate behaviour change, locked in by this test: greeting-ness now tracks
    // "have we ever said hello", not "is this row new". A member whose first action
    // was tapping a menu item has still never been greeted.
    const phone = freshPhone();
    await setStatus('active', null);

    await post(payload('wamid.tap.1', '1', phone));
    expect((await contactRow(phone)).greeted_at).toBeNull();

    h.sent.length = 0;
    await post(payload('wamid.tap.2', 'qualquer coisa', phone));
    expect(h.sent[0].reply?.bodyText).toBe('Olá!');
  });

  it('captures a prayer typed while suspended, and disarms the contact', async () => {
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.oracao.1', 'oi', phone));
    await setMode(phone, 'awaiting_prayer');

    await setStatus('suspended', null);
    h.sent.length = 0;

    const before = await client.query<{ n: number }>(
      "select count(*)::int as n from message where church_id = $1 and direction = 'outbound'",
      [churchId],
    );
    const response = await post(payload('wamid.oracao.2', 'minha mãe está doente', phone));
    const after = await client.query<{ n: number }>(
      "select count(*)::int as n from message where church_id = $1 and direction = 'outbound'",
      [churchId],
    );

    expect(response.status).toBe(200);
    expect(h.sent).toEqual([]);
    expect(after.rows[0].n).toBe(before.rows[0].n);

    const prayers = await client.query<{ text: string }>(
      `select p.text from prayer_request p join contact c on c.id = p.contact_id where c.phone = $1`,
      [phone],
    );
    expect(prayers.rows).toHaveLength(1);
    expect(prayers.rows[0].text).toBe('minha mãe está doente');
    // Disarmed: their turn ended when they wrote, regardless of delivery.
    expect((await contactRow(phone)).mode).toBe('bot');
  });

  it('does not file the next message after reactivation as a prayer', async () => {
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.oracao.3', 'oi', phone));
    await setMode(phone, 'awaiting_prayer');

    await setStatus('suspended', null);
    await post(payload('wamid.oracao.4', 'orem pela minha família', phone));

    await setStatus('active', null);
    h.sent.length = 0;
    await post(payload('wamid.oracao.5', 'oi', phone));

    // Still exactly one prayer, and it is the prayer — not the "oi".
    const prayers = await client.query<{ text: string }>(
      `select p.text from prayer_request p join contact c on c.id = p.contact_id where c.phone = $1`,
      [phone],
    );
    expect(prayers.rows).toHaveLength(1);
    expect(prayers.rows[0].text).toBe('orem pela minha família');
    expect(h.sent).not.toHaveLength(0);
  });

  it('does not arm a prayer capture for a prompt that was never delivered', async () => {
    // The mirror of the bug above: over-eager commits would leave this member armed
    // after a prompt they never saw.
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.armar.1', 'oi', phone));

    await setStatus('suspended', null);
    h.sent.length = 0;
    await post(listPayload('wamid.armar.2', prayerItemId, '🙏 Pedido de Oração', phone));

    expect(h.sent).toEqual([]);
    expect((await contactRow(phone)).mode).toBe('bot');

    await setStatus('active', null);
    await post(payload('wamid.armar.3', 'oi', phone));
    expect(await prayerCount(phone)).toBe(0);
  });

  it('does not hand off to a human nobody was told about', async () => {
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.humano.1', 'oi', phone));

    await setStatus('suspended', null);
    h.sent.length = 0;
    await post(listPayload('wamid.humano.2', humanItemId, '💬 Falar com Atendente', phone));

    expect(h.sent).toEqual([]);
    expect((await contactRow(phone)).mode).toBe('bot');

    // The request still survives in the transcript staff will read.
    const inb = await client.query<{ body: string }>(
      `select m.body from message m join contact c on c.id = m.contact_id
       where c.phone = $1 and m.direction = 'inbound' order by m.created_at desc limit 1`,
      [phone],
    );
    expect(inb.rows[0].body).toBe('💬 Falar com Atendente');

    await setStatus('active', null);
    h.sent.length = 0;
    await post(payload('wamid.humano.3', 'oi', phone));
    expect(h.sent).not.toHaveLength(0);
  });

  it('disarms a mid-prayer member who taps the human item while suspended', async () => {
    // The case every design pass missed. Falling back to the current mode here
    // leaves the member in awaiting_prayer, so the fix for the prayer bug would
    // have reproduced the prayer bug.
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.cruzado.1', 'oi', phone));
    await setMode(phone, 'awaiting_prayer');

    await setStatus('suspended', null);
    h.sent.length = 0;
    await post(listPayload('wamid.cruzado.2', humanItemId, '💬 Falar com Atendente', phone));

    expect(h.sent).toEqual([]);
    expect((await contactRow(phone)).mode).toBe('bot');

    await setStatus('active', null);
    await post(payload('wamid.cruzado.3', 'oi', phone));
    expect(await prayerCount(phone)).toBe(0);
  });

  it('preserves a live handoff through a suspension', async () => {
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.vivo.1', 'oi', phone));
    await setMode(phone, 'human', new Date());
    const before = await contactRow(phone);

    await setStatus('suspended', null);
    h.sent.length = 0;
    await post(payload('wamid.vivo.2', 'ainda estou aqui', phone));

    expect(h.sent).toEqual([]);
    const after = await contactRow(phone);
    expect(after.mode).toBe('human');
    // No spurious write — staff were mid-conversation.
    expect(after.mode_changed_at.getTime()).toBe(before.mode_changed_at.getTime());
  });

  it('still reverts a stale handoff while suspended', async () => {
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.velho.1', 'oi', phone));
    await setMode(phone, 'human', new Date(Date.now() - 25 * 60 * 60 * 1000));

    await setStatus('suspended', null);
    h.sent.length = 0;
    await post(payload('wamid.velho.2', 'alguém?', phone));

    expect(h.sent).toEqual([]);
    // The timeout already elapsed; that is true regardless of delivery. Without
    // this, a suspended church's contacts stay frozen in `human` forever.
    expect((await contactRow(phone)).mode).toBe('bot');
  });

  it('does not over-disarm: whitespace keeps a member awaiting their prayer', async () => {
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.branco.1', 'oi', phone));
    await setMode(phone, 'awaiting_prayer');

    await setStatus('suspended', null);
    h.sent.length = 0;
    await post(payload('wamid.branco.2', '   ', phone));

    expect(h.sent).toEqual([]);
    expect((await contactRow(phone)).mode).toBe('awaiting_prayer');
    expect(await prayerCount(phone)).toBe(0);
  });

  it('dedupes a re-delivered message before it can double-save a prayer', async () => {
    // prayer_request has no unique constraint, so the wa_message_id dedupe is the
    // only barrier — and it now guards a write path that runs while suspended.
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.dup.1', 'oi', phone));
    await setMode(phone, 'awaiting_prayer');

    await setStatus('suspended', null);
    await post(payload('wamid.dup.2', 'orem por mim', phone));
    await post(payload('wamid.dup.2', 'orem por mim', phone));

    expect(await prayerCount(phone)).toBe(1);
    const msgs = await client.query<{ n: number }>(
      'select count(*)::int as n from message where wa_message_id = $1',
      ['wamid.dup.2'],
    );
    expect(msgs.rows[0].n).toBe(1);
  });

  it('stays silent and returns 200 even when the suspended path throws', async () => {
    // More code runs inside the try on the suspended path now, so the catch's
    // `verified && !suspended` guard is exercised more, not less. If it broke, the
    // error_text apology would escape from a church that must be silent.
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.erro.1', 'oi', phone));
    await setMode(phone, 'awaiting_prayer');
    await setStatus('suspended', null);

    // Drop the column the prayer INSERT needs, so savePrayerRequest throws.
    await client.exec('alter table prayer_request rename column text to text_tmp');
    h.sent.length = 0;
    let response: Response;
    try {
      response = await post(payload('wamid.erro.2', 'orem por mim', phone));
    } finally {
      await client.exec('alter table prayer_request rename column text_tmp to text');
    }

    expect(response!.status).toBe(200);
    expect(h.sent).toEqual([]);
  });

  it('leaves a past_due church inside grace completely unaffected', async () => {
    const phone = freshPhone();
    await setStatus('active', null);
    await post(payload('wamid.carencia.3', 'oi', phone));
    await setMode(phone, 'awaiting_prayer');

    await setStatus('past_due', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    h.sent.length = 0;
    await post(payload('wamid.carencia.4', 'orem por mim', phone));

    // Saved AND acknowledged — grace is not suspension.
    expect(await prayerCount(phone)).toBe(1);
    expect(h.sent).not.toHaveLength(0);

    const other = freshPhone();
    await post(payload('wamid.carencia.5', 'oi', other));
    h.sent.length = 0;
    await post(listPayload('wamid.carencia.6', prayerItemId, '🙏 Pedido de Oração', other));

    expect(h.sent).not.toHaveLength(0);
    expect((await contactRow(other)).mode).toBe('awaiting_prayer');
  });
});
