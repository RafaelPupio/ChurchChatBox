import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appBaseUrl } from '@/lib/app-url';
import { consoleEmailSender } from '@/lib/email/console-sender';
import { passwordResetEmail } from '@/lib/email/messages';
import { resetLinkFor } from '@/lib/auth/reset-token';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('appBaseUrl', () => {
  it('prefers the explicit setting', () => {
    expect(appBaseUrl({ APP_BASE_URL: 'https://painel.igreja.br' }))
      .toBe('https://painel.igreja.br');
  });

  it('strips a trailing slash so the link never doubles one', () => {
    expect(appBaseUrl({ APP_BASE_URL: 'https://painel.igreja.br/' }))
      .toBe('https://painel.igreja.br');
  });

  it('falls back to Vercel\'s STABLE production hostname, with a scheme', () => {
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'secretaria.vercel.app' }))
      .toBe('https://secretaria.vercel.app');
  });

  it('ignores the per-deployment VERCEL_URL', () => {
    // That one names an immutable preview deployment sitting behind deployment
    // protection — a reset link built from it would not open the church's panel.
    const url = appBaseUrl({ VERCEL_URL: 'secretaria-abc123.vercel.app' });
    expect(url).not.toContain('abc123');
    expect(url).toBe('http://localhost:3000');
  });

  it('falls back to localhost for development', () => {
    expect(appBaseUrl({})).toBe('http://localhost:3000');
  });

  it('takes nothing from the request', () => {
    // The host-header takeover: if the base URL came from the incoming request, a
    // `Host: evil.example` would produce a reset link pointing at the attacker, in
    // an email that is genuinely from us — and the token would be handed straight
    // over. Nothing request-shaped may reach this module.
    //
    // A STATIC CONTRACT over the source text, like tests/tap-targets.test.ts:
    // there is no way to express "does not read the Host header" as a behavioural
    // assertion, because the failure mode is a future edit adding a `headers()`
    // call that this test would then happily run.
    const source = readFileSync(join(process.cwd(), 'src/lib/app-url.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bheaders\s*\(/);
    expect(code).not.toMatch(/next\/headers/);
    expect(code).not.toMatch(/x-forwarded-host|\bHost\b/i);

    // Host-ish environment variables are not a back door into it either.
    expect(appBaseUrl({ HOST: 'evil.example', HTTP_HOST: 'evil.example' }))
      .toBe('http://localhost:3000');
  });
});

describe('the reset email', () => {
  const link = resetLinkFor('https://painel.igreja.br', 'TOKEN-123');
  const email = passwordResetEmail('maria@igreja.br', link);

  it('is addressed to the requested mailbox and carries the link', () => {
    expect(email.to).toBe('maria@igreja.br');
    expect(email.text).toContain(link);
  });

  it('is written in Brazilian Portuguese', () => {
    expect(email.subject).toMatch(/senha/i);
    expect(email.text).toMatch(/Olá/);
    expect(email.text).toMatch(/nova senha/i);
    expect(email.text).not.toMatch(/\b(password|reset|click here|expires)\b/i);
  });

  it('says how long the link lasts and that it works once', () => {
    // A volunteer who comes back to it tomorrow needs to know why it stopped
    // working, and needs to be told before she is confused rather than after.
    expect(email.text).toMatch(/1 hora/);
    expect(email.text).toMatch(/uma vez/);
  });

  it('names no church', () => {
    // Admin emails are typed by hand at provisioning and are never verified, so a
    // typo puts this message in a stranger's real inbox. A stranger must not learn
    // which congregation to go looking at.
    expect(email.text).not.toMatch(/igreja\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/);
    expect(email.subject).not.toMatch(/igreja/i);
  });

  it('never uses the forbidden word', () => {
    expect(`${email.subject} ${email.text}`.toLowerCase()).not.toContain('dízimo');
  });

  it('reassures rather than alarms someone who did not ask for it', () => {
    // The realistic reader of an unexpected copy is a person who mistyped their own
    // address, not a victim of an attack.
    expect(email.text).toMatch(/ignorar esta mensagem/i);
    expect(email.text).toMatch(/continua funcionando/i);
  });

  it('is plain text only', () => {
    expect(Object.keys(email).sort()).toEqual(['subject', 'text', 'to']);
    expect(email.text).not.toMatch(/<[a-z]+[\s>]/i);
  });
});

describe('the development transport', () => {
  it('prints the whole message so the link can be copied out of the terminal', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const link = resetLinkFor('http://localhost:3000', 'TOKEN-XYZ');

    await consoleEmailSender.send(passwordResetEmail('maria@igreja.br', link));

    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('maria@igreja.br');
    expect(printed).toContain(link);
  });

  it('shouts in production instead of pretending it delivered something', async () => {
    // With no provider configured a production reset silently reaches nobody. The
    // operator has to be able to see that in the logs.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const previous = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');

    try {
      await consoleEmailSender.send(passwordResetEmail('maria@igreja.br', 'https://x'));
      expect(error).toHaveBeenCalled();
      expect(String(error.mock.calls[0][0])).toMatch(/NO EMAIL PROVIDER CONFIGURED/);
    } finally {
      vi.unstubAllEnvs();
      expect(process.env.NODE_ENV).toBe(previous);
      log.mockRestore();
    }
  });

  it('resolves rather than throwing, whatever it is given', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(consoleEmailSender.send({ to: '', subject: '', text: '' })).resolves.toBeUndefined();
  });
});
