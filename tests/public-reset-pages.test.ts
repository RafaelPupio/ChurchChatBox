import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A STATIC CONTRACT over where the two public pages live and what they may read.
 *
 *  tests/privilege-boundary.test.ts requires every page.tsx under
 *  src/app/admin/(protected) to import requireReadableSession. That rule is right,
 *  and it is exactly why these two pages must NOT live there: a person who has
 *  forgotten her password cannot be asked to log in before recovering it. Nothing
 *  else in the repo states the other half — that these two stay outside and stay
 *  reachable — so a well-meaning tidy-up that moved them under (protected) would
 *  satisfy every existing test while making the whole feature unusable.
 *
 *  The second half is about leakage: the URLs must not be able to answer "does
 *  this church exist?". */

const APP = join(process.cwd(), 'src/app');
const PROTECTED = join(APP, 'admin/(protected)');

const PUBLIC_PAGES = {
  'esqueci-senha': join(APP, 'admin/esqueci-senha/page.tsx'),
  'redefinir-senha': join(APP, 'admin/redefinir-senha/page.tsx'),
};

/** Source with comments removed. These pages EXPLAIN in prose why they do not use
 *  the session guards, so a naive text match finds the guard names in exactly the
 *  files that correctly avoid calling them. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

describe('the reset pages are public', () => {
  it.each(Object.entries(PUBLIC_PAGES))('%s exists outside the protected group', (_name, path) => {
    expect(existsSync(path)).toBe(true);
    expect(path.startsWith(PROTECTED)).toBe(false);
    expect(path).not.toContain('(protected)');
  });

  it.each(Object.entries(PUBLIC_PAGES))('%s requires no session to render', (_name, path) => {
    const source = code(path);
    // Any of these would redirect a logged-out visitor to the login page — which
    // is the one page she cannot get past.
    expect(source).not.toMatch(/\brequireReadableSession\b/);
    expect(source).not.toMatch(/\brequireWritableSession\b/);
    expect(source).not.toMatch(/\brequireSession\b/);
    expect(source).not.toMatch(/\bisAuthenticated\b/);
  });

  it.each(Object.entries(PUBLIC_PAGES))('%s has no dynamic segment in its route', (_name, path) => {
    // A `[churchId]` anywhere in these routes would turn the URL itself into a
    // church-existence probe: one path 200s and another 404s.
    const route = path.slice(APP.length);
    expect(route).not.toMatch(/\[[^\]]+\]/);
  });
});

describe('the pages leak nothing about which churches exist', () => {
  it.each(Object.entries(PUBLIC_PAGES))('%s reads no church data', (_name, path) => {
    const source = code(path);
    expect(source).not.toMatch(/getChurchById|listChurches|getChurchForOwner|@\/lib\/repo\/church/);
  });

  it('the reset page does not look the token up while rendering', () => {
    // Doing so would cost a query on every visit and would let anyone measure
    // whether a given token exists without ever submitting the form. The token is
    // checked once, where it is spent.
    const source = code(PUBLIC_PAGES['redefinir-senha']);
    expect(source).not.toMatch(/consumeResetToken|listResetTokensFor|findAdminBy/);
  });

  it('the reset page suppresses the Referer that would carry the token', () => {
    // The token is in the query string — unavoidable, a link is what arrives by
    // email — so any request this page triggers would otherwise hand the full URL
    // to a third party.
    const source = readFileSync(PUBLIC_PAGES['redefinir-senha'], 'utf8');
    expect(source).toMatch(/referrer:\s*'no-referrer'/);
  });

  it.each(Object.entries(PUBLIC_PAGES))('%s asks not to be indexed', (_name, path) => {
    expect(readFileSync(path, 'utf8')).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

describe('the way in is signposted', () => {
  it('the login page offers the reset link', () => {
    // Otherwise the feature exists and nobody can find it.
    const login = readFileSync(join(APP, 'admin/login/LoginForm.tsx'), 'utf8');
    expect(login).toMatch(/\/admin\/esqueci-senha/);
    expect(login).toMatch(/Esqueci minha senha/);
  });

  it('the settings page offers the change-password form', () => {
    const settings = readFileSync(join(PROTECTED, 'configuracoes/page.tsx'), 'utf8');
    expect(settings).toMatch(/<PasswordForm\b/);
  });
});
