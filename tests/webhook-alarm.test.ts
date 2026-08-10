import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * THE 2026-08-10 OUTAGE, REPRODUCED AND THEN MADE VISIBLE.
 *
 * Migration 0005 added church.courtesy_text. The code shipped; the migration was
 * never applied to the live database. findChurchByPhoneNumberId selects every
 * column, so it selected one that did not exist, the query threw, the webhook's
 * catch swallowed it and returned 200 — and every member of every church got
 * silence. Meta was satisfied. Nobody was told. A human found it by running a
 * simulation.
 *
 * The 680-test suite could not see it, and structurally still cannot: these tests
 * run on a PGlite where every migration is applied by definition. So this file
 * does not test "the schema is right" — it drops the column ON PURPOSE, mid-test,
 * and asserts that the failure now leaves a row behind that says so.
 *
 * Only the Graph API is stubbed. verifySignature stays real, so every payload
 * below is genuinely HMAC-signed with the church's app_secret.
 */

const h = vi.hoisted(() => ({ sent: [] as { kind: 'reply' | 'text' }[] }));

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__alarmClient = client;
  return { db: drizzle(client, { schema }) };
});

vi.mock('@/lib/whatsapp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp')>();
  return {
    ...actual,
    sendReply: async () => { h.sent.push({ kind: 'reply' }); },
    sendText: async () => { h.sent.push({ kind: 'text' }); },
  };
});

const { POST } = await import('@/app/api/whatsapp/webhook/route');
const { NextRequest } = await import('next/server');
const { listRecentWebhookFailures } = await import('@/lib/repo/platform');
const { recordWebhookFailure } = await import('@/lib/repo/webhook-failure');
const { FAILURE_WINDOW_MS } = await import('@/lib/webhook-failure');

const APP_SECRET = 'segredo-do-app';
const PHONE_NUMBER_ID = 'PNID_ALARME';

let client: PGlite;
let churchId: string;

interface FailureRow {
  church_id: string | null;
  reason: string;
  failure_count: number;
  first_seen_at: Date;
  last_seen_at: Date;
}

async function failureRows(): Promise<FailureRow[]> {
  const r = await client.query<FailureRow>('select * from webhook_failure order by last_seen_at');
  return r.rows;
}

let messageCounter = 0;
function payload(text = 'oi'): string {
  messageCounter += 1;
  return JSON.stringify({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: PHONE_NUMBER_ID },
          contacts: [{ profile: { name: 'Membro' } }],
          messages: [{ id: `wamid.alarme.${messageCounter}`, from: '5511999990000', type: 'text', text: { body: text } }],
        },
      }],
    }],
  });
}

async function post(body: string): Promise<Response> {
  const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex');
  return POST(new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    body,
    headers: { 'x-hub-signature-256': signature, 'content-type': 'application/json' },
  }));
}

/** Runs `body` with the live schema broken exactly the way 2026-08-10 broke it,
 *  and always puts it back — a leaked rename would fail every later test with a
 *  message about the wrong thing. */
async function withBrokenSchema(breakIt: string, fixIt: string, body: () => Promise<void>): Promise<void> {
  await client.exec(breakIt);
  try {
    await body();
  } finally {
    await client.exec(fixIt);
  }
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__alarmClient as PGlite;
  const dir = join(process.cwd(), 'drizzle');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  const c = await client.query<{ id: string }>(
    `insert into church (name,phone_number_id,access_token,app_secret,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ('Igreja Teste',$1,'token',$2,'Olá!','Escolha:','Ver opções','Não entendi','Só texto','Erro','Escreva','Recebemos','Um momento','Encerrado') returning id`,
    [PHONE_NUMBER_ID, APP_SECRET],
  );
  churchId = c.rows[0].id;

  await client.query(
    `insert into menu_item (church_id,position,label,body_text,is_active,kind)
     values ($1,1,'⛪ Horários','Domingo 18h',true,'content')`,
    [churchId],
  );
});

beforeEach(async () => {
  h.sent.length = 0;
  await client.exec('delete from webhook_failure');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the outage that started this', () => {
  it('leaves a row saying which column was missing', async () => {
    await withBrokenSchema(
      'alter table church rename column courtesy_text to courtesy_text_tmp',
      'alter table church rename column courtesy_text_tmp to courtesy_text',
      async () => {
        const response = await post(payload());
        // Still 200: a non-200 makes Meta retry and a retry means a real person
        // is answered twice. That rule does not bend, which is exactly why the
        // failure has to be recorded instead.
        expect(response.status).toBe(200);
      },
    );

    const rows = await failureRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toMatch(/courtesy_text/);
    expect(rows[0].reason).toMatch(/does not exist/);
    // Unattributed, and that is the whole reason church_id is nullable: the query
    // that IDENTIFIES the church is the one that broke. A NOT NULL column here
    // would have recorded nothing on the day it was needed.
    expect(rows[0].church_id).toBeNull();
  });

  it('records nothing at all when the webhook works', async () => {
    const response = await post(payload());

    expect(response.status).toBe(200);
    expect(h.sent).not.toHaveLength(0);
    expect(await failureRows()).toEqual([]);
  });
});

describe('a broken church does not flood the table', () => {
  it('counts 25 failures into one row instead of appending 25', async () => {
    // A church broken this way fails once per inbound message. On a Sunday
    // morning that is thousands of rows carrying one sentence, and an alarm you
    // have to paginate is one nobody reads.
    await withBrokenSchema(
      'alter table church rename column courtesy_text to courtesy_text_tmp',
      'alter table church rename column courtesy_text_tmp to courtesy_text',
      async () => {
        for (let i = 0; i < 25; i += 1) await post(payload());
      },
    );

    const rows = await failureRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].failure_count).toBe(25);
    expect(rows[0].first_seen_at.getTime()).toBeLessThanOrEqual(rows[0].last_seen_at.getTime());
  });

  it('keeps genuinely different failures apart', async () => {
    await recordWebhookFailure(null, new Error('column "courtesy_text" does not exist'));
    await recordWebhookFailure(null, new Error('fetch failed'));
    await recordWebhookFailure(churchId, new Error('fetch failed'));

    const rows = await failureRows();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.failure_count === 1)).toBe(true);
  });

  it('restarts the count when the previous failure is older than the window', async () => {
    // Without this, a church that failed twice in March and once today reads as
    // "3 falhas" — a number that describes nothing that is happening.
    await recordWebhookFailure(null, new Error('fetch failed'));
    await client.query(
      `update webhook_failure set failure_count = 400,
         first_seen_at = now() - interval '30 days', last_seen_at = now() - interval '29 days'`,
    );

    await recordWebhookFailure(null, new Error('fetch failed'));

    const rows = await failureRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].failure_count).toBe(1);
    expect(Date.now() - rows[0].first_seen_at.getTime()).toBeLessThan(60_000);
  });
});

describe('the recording never breaks the webhook', () => {
  it('returns 200 even when recording the failure is itself impossible', async () => {
    // The alarm runs inside the catch of a handler whose one rule is ALWAYS
    // RETURN 200. If it could throw, a silent bot would become a bot that
    // answers every member twice — strictly worse than the bug it reports.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await withBrokenSchema(
      'alter table webhook_failure rename to webhook_failure_tmp',
      'alter table webhook_failure_tmp rename to webhook_failure',
      async () => {
        await withBrokenSchema(
          'alter table church rename column courtesy_text to courtesy_text_tmp',
          'alter table church rename column courtesy_text_tmp to courtesy_text',
          async () => {
            const response = await post(payload());
            expect(response.status).toBe(200);
          },
        );
      },
    );

    // Silently swallowing it would be the same disease one level down.
    expect(logged.mock.calls.some(([m]) => String(m).includes('Could not record webhook failure'))).toBe(true);
  });

  it('never rejects, whatever it is handed', async () => {
    // Each of these used to be a way to make the alarm itself throw: a message
    // that is empty (NOT NULL violation), a value String() refuses to convert,
    // and a church id that satisfies no foreign key.
    await expect(recordWebhookFailure(null, new Error(''))).resolves.toBeUndefined();
    await expect(recordWebhookFailure(null, Object.create(null))).resolves.toBeUndefined();
    await expect(
      recordWebhookFailure('00000000-0000-0000-0000-000000000000', new Error('órfã')),
    ).resolves.toBeUndefined();
  });
});

describe('a failure after the church is known is attributed to it', () => {
  it('names the church when the failure happens past the signature check', async () => {
    await withBrokenSchema(
      'alter table menu_item rename column body_text to body_text_tmp',
      'alter table menu_item rename column body_text_tmp to body_text',
      async () => {
        const response = await post(payload());
        expect(response.status).toBe(200);
      },
    );

    const rows = await failureRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].church_id).toBe(churchId);
    expect(rows[0].reason).toMatch(/body_text/);
  });

  it('records a suspended church too', async () => {
    // Suspension silences OUTBOUND WhatsApp — a promise to that church's members.
    // It was never a promise to stop knowing things about our own product.
    await client.query("update church set status = 'suspended' where id = $1", [churchId]);
    try {
      await withBrokenSchema(
        'alter table menu_item rename column body_text to body_text_tmp',
        'alter table menu_item rename column body_text_tmp to body_text',
        async () => { await post(payload()); },
      );
    } finally {
      await client.query("update church set status = 'active' where id = $1", [churchId]);
    }

    expect(h.sent).toEqual([]);
    const rows = await failureRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].church_id).toBe(churchId);
  });
});

describe('what the owner console reads', () => {
  it('returns the church name, and null for an unattributed failure', async () => {
    await recordWebhookFailure(churchId, new Error('fetch failed'));
    await recordWebhookFailure(null, new Error('column "courtesy_text" does not exist'));

    const failures = await listRecentWebhookFailures(new Date(Date.now() - FAILURE_WINDOW_MS));

    expect(failures).toHaveLength(2);
    // Most recent first: the console asks what is broken NOW.
    expect(failures[0].reason).toMatch(/courtesy_text/);
    expect(failures[0].churchName).toBeNull();
    expect(failures[1].churchName).toBe('Igreja Teste');
    expect(failures[1].churchId).toBe(churchId);
  });

  it('goes quiet once a fixed incident falls out of the window', async () => {
    // An alarm nobody can silence is an alarm everybody learns to ignore. Fix the
    // bug and the banner disappears on its own within a day — no button, no
    // "resolved" flag that someone has to remember to set.
    await recordWebhookFailure(churchId, new Error('fetch failed'));
    await client.query(`update webhook_failure set last_seen_at = now() - interval '25 hours'`);

    expect(await listRecentWebhookFailures(new Date(Date.now() - FAILURE_WINDOW_MS))).toEqual([]);
    // The row itself is still there; only the alarm moved on.
    expect(await failureRows()).toHaveLength(1);
  });

  it('bounds how much it will render', async () => {
    for (let i = 0; i < 8; i += 1) await recordWebhookFailure(null, new Error(`falha ${i}`));

    const failures = await listRecentWebhookFailures(new Date(Date.now() - FAILURE_WINDOW_MS), 3);

    expect(failures).toHaveLength(3);
  });
});
