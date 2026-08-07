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

const h = vi.hoisted(() => ({
  sent: [] as { kind: 'reply' | 'text'; to: string }[],
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
    sendReply: async (_c: unknown, to: string) => {
      h.sent.push({ kind: 'reply', to });
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

function payload(waMessageId: string, text: string): string {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name: 'Membro' } }],
              messages: [{ id: waMessageId, from: MEMBER, type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
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
});

beforeEach(() => {
  h.sent.length = 0;
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

    const outbound = await client.query<{ n: number }>(
      "select count(*)::int as n from message where church_id = $1 and direction = 'outbound'",
      [churchId],
    );
    // Only the active-church test above produced outbound rows.
    expect(outbound.rows[0].n).toBeGreaterThan(0);
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
