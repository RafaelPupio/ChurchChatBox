import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = join(process.cwd(), 'src/app/api/cron/purge/route.ts');

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('the cron route declarations', () => {
  it('exports GET and does NOT export POST', () => {
    // Vercel Cron issues a GET. A route exporting only POST ships a 405 on a
    // schedule, and this design has no alarm for a dead cron — so the failure
    // would be silent and permanent. Asserted by static read, like the export
    // routes' maxDuration check.
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+GET\b/);
    expect(src).not.toMatch(/export\s+async\s+function\s+POST\b/);
  });

  it('declares force-dynamic and maxDuration 60', () => {
    // A cacheable GET on a path Vercel calls daily is a purge that runs once and
    // then serves its own stale response every day thereafter.
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*'force-dynamic'/);
    expect(src).toMatch(/export\s+const\s+maxDuration\s*=\s*60/);
  });
});

describe('cron authentication', () => {
  async function callWith(headers: Record<string, string>) {
    const { GET } = await import('@/app/api/cron/purge/route');
    return GET(new Request('https://example.com/api/cron/purge', { headers }));
  }

  it('refuses with 503 when CRON_SECRET is unset — fails CLOSED', async () => {
    // The deliberate inversion of this codebase's fail-open habit. Every other
    // guard fails toward service; an unauthenticated purge endpoint is a public
    // delete button.
    vi.stubEnv('CRON_SECRET', '');
    const res = await callWith({ authorization: 'Bearer qualquer' });
    expect(res.status).toBe(503);
  });

  it('401s with no Authorization header', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron');
    expect((await callWith({})).status).toBe(401);
  });

  it('401s with a wrong token', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron');
    expect((await callWith({ authorization: 'Bearer errado' })).status).toBe(401);
  });

  it('401s on a token of a different length without leaking that fact', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-do-cron');
    expect((await callWith({ authorization: 'Bearer x' })).status).toBe(401);
  });
});

describe('vercel.json', () => {
  it('schedules the purge daily at 06:00 UTC on the GET path', () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(cfg.crons).toEqual([{ path: '/api/cron/purge', schedule: '0 6 * * *' }]);
  });
});
