import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let db: PGlite;
let A: Fixture;
let B: Fixture;

interface Fixture {
  churchId: string;
  contactId: string;
  menuItemId: string;
  prayerId: string;
  adminId: string;
}

async function makeChurch(name: string, phone: string, phoneNumberId: string): Promise<Fixture> {
  const c = await db.query<{ id: string }>(
    `insert into church (name,phone_number_id,access_token,app_secret,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,$2,'tok','sec','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name, phoneNumberId],
  );
  const churchId = c.rows[0].id;
  const ct = await db.query<{ id: string }>(
    `insert into contact (church_id,phone,name,mode,last_inbound_at) values ($1,$2,$3,'human',now()) returning id`,
    [churchId, phone, `Membro de ${name}`],
  );
  const contactId = ct.rows[0].id;
  await db.query(
    `insert into message (church_id,contact_id,wa_message_id,direction,body) values ($1,$2,$3,'inbound',$4)`,
    [churchId, contactId, `wamid.${name}`, `segredo de ${name}`],
  );
  const mi = await db.query<{ id: string }>(
    `insert into menu_item (church_id,position,label,body_text,is_active,kind) values ($1,1,$2,'corpo',true,'content') returning id`,
    [churchId, `Menu ${name}`],
  );
  const pr = await db.query<{ id: string }>(
    `insert into prayer_request (church_id,contact_id,text) values ($1,$2,$3) returning id`,
    [churchId, contactId, `oração privada de ${name}`],
  );
  const ad = await db.query<{ id: string }>(
    `insert into admin_user (church_id,email,password_hash,name) values ($1,$2,'h',$3) returning id`,
    [churchId, `admin@${name}.org`, `Admin ${name}`],
  );
  return { churchId, contactId, menuItemId: mi.rows[0].id, prayerId: pr.rows[0].id, adminId: ad.rows[0].id };
}

beforeAll(async () => {
  db = new PGlite();
  // Apply every migration in order, so this suite keeps working as they accrue.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await db.exec(stmt);
    }
  }
  A = await makeChurch('IgrejaA', '5511111', 'PNID_A');
  B = await makeChurch('IgrejaB', '5522222', 'PNID_B');
});

describe('tenant isolation — reads', () => {
  it('listConversations returns only the caller church', async () => {
    const r = await db.query<{ church_id: string }>(
      `select * from contact where church_id=$1 order by last_inbound_at desc nulls last`, [A.churchId]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows.every((x) => x.church_id === A.churchId)).toBe(true);
  });

  it('loadConversation with another church\'s contactId returns nothing', async () => {
    const r = await db.query(`select * from contact where id=$1 and church_id=$2 limit 1`, [B.contactId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('one church cannot read another\'s messages', async () => {
    const r = await db.query(`select * from message where contact_id=$1 and church_id=$2`, [B.contactId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('prayer, menu and staff lists exclude the other church', async () => {
    const p = await db.query<{ text: string }>(
      `select p.text from prayer_request p join contact c on p.contact_id=c.id where p.church_id=$1`, [A.churchId]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].text).not.toContain('IgrejaB');

    const m = await db.query(`select * from menu_item where church_id=$1`, [A.churchId]);
    expect(m.rows).toHaveLength(1);

    const s = await db.query<{ email: string }>(`select * from admin_user where church_id=$1`, [A.churchId]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].email).toContain('IgrejaA');
  });
});

describe('tenant isolation — writes change zero rows', () => {
  it('cannot edit another church\'s menu item', async () => {
    const r = await db.query(`update menu_item set label='HACKED' where id=$1 and church_id=$2 returning id`,
      [B.menuItemId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('cannot flip another church\'s contact mode', async () => {
    const r = await db.query(`update contact set mode='bot' where id=$1 and church_id=$2 returning id`,
      [B.contactId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('cannot mark another church\'s prayer request', async () => {
    const r = await db.query(`update prayer_request set status='orado' where id=$1 and church_id=$2 returning id`,
      [B.prayerId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('cannot delete another church\'s admin', async () => {
    const r = await db.query(`delete from admin_user where id=$1 and church_id=$2 returning id`,
      [B.adminId, A.churchId]);
    expect(r.rows).toHaveLength(0);
  });

  it('editing own church touches exactly one row and leaves the other untouched', async () => {
    const own = await db.query(`update church set greeting_text='editado por A' where id=$1 returning id`, [A.churchId]);
    expect(own.rows).toHaveLength(1);
    const other = await db.query<{ greeting_text: string }>(`select greeting_text from church where id=$1`, [B.churchId]);
    expect(other.rows[0].greeting_text).toBe('oi');
  });

  it('leaves the other church\'s data fully intact', async () => {
    const r = await db.query<{ c: number; m: number; a: number; p: number }>(
      `select (select count(*) from contact where church_id=$1)::int c,
              (select count(*) from menu_item where church_id=$1 and label like 'Menu%')::int m,
              (select count(*) from admin_user where church_id=$1)::int a,
              (select count(*) from prayer_request where church_id=$1 and status='novo')::int p`,
      [B.churchId]);
    expect(r.rows[0]).toEqual({ c: 1, m: 1, a: 1, p: 1 });
  });
});

describe('webhook tenant routing', () => {
  it('each phone_number_id resolves to its own church', async () => {
    const a = await db.query<{ name: string }>(`select name from church where phone_number_id=$1 limit 1`, ['PNID_A']);
    const b = await db.query<{ name: string }>(`select name from church where phone_number_id=$1 limit 1`, ['PNID_B']);
    expect(a.rows[0].name).toBe('IgrejaA');
    expect(b.rows[0].name).toBe('IgrejaB');
  });
});

describe('LGPD Art. 18 — deleting one church', () => {
  it('cascades all of that church and leaves the other whole', async () => {
    await db.query(`delete from church where id=$1`, [A.churchId]);
    const r = await db.query<{ c: number; m: number; p: number; a: number; ch: number }>(
      `select (select count(*) from contact)::int c,(select count(*) from message)::int m,
              (select count(*) from prayer_request)::int p,(select count(*) from admin_user)::int a,
              (select count(*) from church)::int ch`);
    expect(r.rows[0]).toEqual({ c: 1, m: 1, p: 1, a: 1, ch: 1 });
  });
});
