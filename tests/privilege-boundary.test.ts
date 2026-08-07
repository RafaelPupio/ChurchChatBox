import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Church-facing code must never import the owner-only cross-church repo.
 *  This is the only thing enforcing that boundary — the repo has no linter.
 *
 *  Matching on the raw specifier text was not enough: `import … from './platform'`
 *  inside src/lib/repo/ names the exact same module and never contains the string
 *  "repo/platform". So every specifier is RESOLVED to an absolute path first and
 *  compared against the real file. Alias (`@/lib/repo/platform`), relative
 *  (`./platform`, `../repo/platform`, `../../lib/repo/platform`) and
 *  extension-bearing forms all collapse to the same path.
 *
 *  Catches static `import … from`, side-effect `import '…'`, dynamic `import(…)`
 *  and `require(…)` — any import form. */

const SRC = join(process.cwd(), 'src');

/** src/lib is in here because the boundary is about REACHABILITY, not directory.
 *  src/lib/auth/writable.ts is imported by every admin write action; if it pulled
 *  in the platform repo, every church admin would transitively hold cross-church
 *  queries. Scanning only app/admin, app/api and lib/repo left that gap open. */
const CHURCH_FACING_ROOTS = [
  join(SRC, 'app/admin'),
  join(SRC, 'app/api'),
  join(SRC, 'lib'),
];

/** The owner-only module itself. Nothing else under the scanned roots is
 *  owner-only: src/app/owner/ reaches the platform repo directly and otherwise
 *  imports only shared modules (church-status, church-defaults, provisioning) and
 *  src/lib/repo/owner.ts, which is owner-account auth, not cross-church data. */
const PLATFORM_MODULE = join(SRC, 'lib/repo/platform.ts');
const ALLOWED = new Set([PLATFORM_MODULE]);

/** Every import form, capturing the specifier. */
const SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx?$/.test(full) && !ALLOWED.has(full)) out.push(full);
  }
  return out;
}

/** Absolute path a specifier refers to, without extension — or null for a bare
 *  package specifier ('next/navigation', 'drizzle-orm'), which can never be a
 *  local module. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let target: string;
  if (specifier.startsWith('@/')) target = join(SRC, specifier.slice(2));
  else if (specifier.startsWith('./') || specifier.startsWith('../')) target = resolve(dirname(fromFile), specifier);
  else return null;
  return target.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
}

function importedModules(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const match of source.matchAll(SPECIFIER_RE)) {
    const resolved = resolveSpecifier(file, match[1]);
    if (resolved) out.push(resolved);
  }
  return out;
}

describe('privilege boundary', () => {
  it('no church-facing file imports the owner-only platform repo', () => {
    const files = CHURCH_FACING_ROOTS.flatMap((d) => walk(d));
    // Guard against a bad glob silently passing by scanning nothing.
    expect(files.length).toBeGreaterThan(40);

    const platformBase = PLATFORM_MODULE.replace(/\.tsx?$/, '');
    const offenders = files.filter((f) => importedModules(f).includes(platformBase));
    expect(offenders).toEqual([]);
  });

  it('resolves alias, relative and extension-bearing specifiers to the same module', () => {
    // The resolver is the whole guard; if it stopped normalising these forms the
    // test above would pass while the boundary was open.
    const platformBase = PLATFORM_MODULE.replace(/\.tsx?$/, '');
    const inboxFile = join(SRC, 'lib/repo/inbox.ts');
    const writableFile = join(SRC, 'lib/auth/writable.ts');

    expect(resolveSpecifier(inboxFile, './platform')).toBe(platformBase);
    expect(resolveSpecifier(inboxFile, '../repo/platform')).toBe(platformBase);
    expect(resolveSpecifier(inboxFile, '@/lib/repo/platform')).toBe(platformBase);
    expect(resolveSpecifier(writableFile, '../../lib/repo/platform')).toBe(platformBase);
    expect(resolveSpecifier(writableFile, '../repo/platform.ts')).toBe(platformBase);
    // Bare package specifiers are never local modules.
    expect(resolveSpecifier(writableFile, 'next/navigation')).toBeNull();
  });
});

/** requireSession() trusts the session cookie alone. requireReadableSession() also
 *  re-reads the admin row and confirms it still exists and still belongs to this
 *  church, so a secretary removed via removeStaff loses access on their next page
 *  load rather than whenever their cookie happens to expire.
 *
 *  That distinction only holds if every page actually picks the right one, and
 *  nothing but this test makes it hold: both are exported, both typecheck, and a
 *  page using the weaker one renders perfectly. The panel shows member phone
 *  numbers, message bodies and prayer requests — under LGPD Art. 5 II a church's
 *  membership is sensitive personal data, and a removed staff member is a former
 *  agent of the controller. */
const ADMIN_PROTECTED = join(SRC, 'app/admin/(protected)');

/** Pages that render no church data and so need no guard. Kept as an explicit
 *  list rather than inferred: adding a page here is a deliberate, reviewable act,
 *  whereas a rule clever enough to infer "this one is safe" is a rule that can be
 *  fooled by the next page. */
const NO_CHURCH_DATA = new Set([
  // Bare redirect to /admin/conteudo — reads nothing, renders nothing.
  join(ADMIN_PROTECTED, 'page.tsx'),
]);

describe('admin read guard', () => {
  it('every protected page uses the re-checking read guard', () => {
    const pages = walk(ADMIN_PROTECTED).filter((f) => /\bpage\.tsx$/.test(f));
    // Guard against a bad path silently passing by scanning nothing.
    expect(pages.length).toBeGreaterThan(5);

    // Stated as "must import the strong guard", not "must not import the weak
    // one": the weak-guard phrasing let a page pass by using getSession() or
    // isAuthenticated() directly, or by having no guard at all.
    const writableModule = join(SRC, 'lib/auth/writable');
    const offenders = pages
      .filter((f) => !NO_CHURCH_DATA.has(f))
      .filter((f) => !importedModules(f).includes(writableModule) || !/\brequireReadableSession\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
