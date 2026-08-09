import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '@/app/manifest';

/** Installability is all-or-nothing and fails silently: a missing 192px icon or a
 *  start_url outside the scope simply means the "Adicionar à Tela de Início"
 *  prompt never appears, with no error anywhere. These assertions are the only
 *  thing standing between a refactor and a panel that quietly stops installing. */

const ROOT = process.cwd();
const LAYOUT = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8');

describe('web app manifest', () => {
  const m = manifest();

  it('is installable: standalone, in scope, with a start_url', () => {
    expect(m.display).toBe('standalone');
    expect(m.scope).toBe('/');
    expect(m.start_url).toBe('/admin');
    expect(m.start_url?.startsWith(m.scope ?? '/')).toBe(true);
  });

  it('carries a short_name short enough for a home screen', () => {
    // Narrowed through a local rather than asserted inline: short_name is
    // optional on MetadataRoute.Manifest, and `m.short_name.length` does not
    // typecheck under strict mode. An undefined value still fails the first
    // assertion, so nothing is weakened.
    const shortName = m.short_name ?? '';
    expect(shortName).toBe('Secretária');
    expect(shortName.length).toBeLessThanOrEqual(12);
  });

  it('uses the stylesheet tokens for its colours', () => {
    const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
    expect(m.theme_color).toBe('#075e54');
    expect(m.background_color).toBe('#f6f7f9');
    expect(css).toContain('--primary: #075e54');
    expect(css).toContain('--bg: #f6f7f9');
  });

  it('is declared as Brazilian Portuguese', () => {
    expect(m.lang).toBe('pt-BR');
    expect(LAYOUT).toContain('lang="pt-BR"');
  });

  it('ships 192px, 512px and a maskable variant', () => {
    const icons = m.icons ?? [];
    expect(icons.find((i) => i.sizes === '192x192' && i.purpose === 'any')).toBeTruthy();
    expect(icons.find((i) => i.sizes === '512x512' && i.purpose === 'any')).toBeTruthy();
    expect(icons.find((i) => i.purpose === 'maskable')).toBeTruthy();
    for (const icon of icons) expect(icon.type).toBe('image/png');
  });

  it('every icon has a route or a file behind it', () => {
    for (const icon of m.icons ?? []) {
      const asRoute = join(ROOT, 'src/app', icon.src, 'route.tsx');
      const asFile = join(ROOT, 'public', icon.src);
      expect(existsSync(asRoute) || existsSync(asFile), `no source for ${icon.src}`).toBe(true);
    }
  });
});

describe('viewport', () => {
  it('declares a viewport export with a theme colour', () => {
    expect(LAYOUT).toMatch(/export const viewport: Viewport/);
    expect(LAYOUT).toContain("themeColor: '#075e54'");
  });

  it('opts into the safe-area insets the chrome depends on', () => {
    expect(LAYOUT).toContain("viewportFit: 'cover'");
  });

  it('declares the viewport exactly once', () => {
    // Two competing declarations — an `export const viewport` plus a hand-written
    // <meta name="viewport"> in the JSX — is a coin-flip over which one wins.
    expect(LAYOUT.match(/export const viewport/g)).toHaveLength(1);
    expect(LAYOUT).not.toMatch(/<meta\s+name=["']viewport["']/);
  });

  it('never disables pinch-zoom', () => {
    // Taking zoom away from an older volunteer to make the panel feel more
    // "app-like" is a trade this product does not make.
    expect(LAYOUT).not.toMatch(/maximumScale|userScalable|user-scalable|maximum-scale/);
  });
});

/** Block comments removed, so these assertions read CODE and not prose.
 *
 *  Same reason tests/mobile-css.test.ts strips comments before matching: the
 *  offline page's own header comment explains WHY it does not call
 *  requireReadableSession, and naming the thing it avoids must not be what fails
 *  the check that it avoids it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('offline behaviour', () => {
  const SW = code(readFileSync(join(ROOT, 'public/sw.js'), 'utf8'));
  const OFFLINE_RAW = readFileSync(join(ROOT, 'src/app/offline/page.tsx'), 'utf8');
  const OFFLINE = code(OFFLINE_RAW);

  it('the service worker only intercepts whole-page navigations', () => {
    expect(SW).toContain("request.mode !== 'navigate'");
  });

  it('caches exactly one entry, and it is not an admin route', () => {
    // Caching any admin response would leave member phone numbers, message
    // bodies and prayer requests readable on a shared parish phone after logout.
    expect(SW).not.toContain('/admin');
    expect([...SW.matchAll(/cache\.(add|put)\(/g)]).toHaveLength(1);
  });

  it('the offline page renders without the database or a session', () => {
    // It must render with no network at all, so it can import neither.
    expect(OFFLINE).not.toContain('@/db');
    expect(OFFLINE).not.toContain('@/lib/repo');
    expect(OFFLINE).not.toContain('requireReadableSession');
  });

  it('the offline page carries its own styles', () => {
    // The worker caches this document but never the hashed CSS bundle, so an
    // external stylesheet would not load at the moment it is needed.
    expect(OFFLINE).not.toContain("import './globals.css'");
    expect(OFFLINE).toContain('fontFamily');
  });

  it('lives outside src/app/admin on purpose', () => {
    expect(existsSync(join(ROOT, 'src/app/offline/page.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/app/admin/offline'))).toBe(false);
  });

  it('never tells her an unsent draft is safe', () => {
    // This is the honesty rule, asserted rather than trusted to review. Nothing
    // in this product queues an unsent reply: there is no outbox and no
    // background sync, and the sessionStorage mirror does not survive a
    // relaunched standalone app. Copy that implies otherwise is a promise the
    // panel cannot keep, on the one screen she reads when something has already
    // gone wrong.
    // Stripped, like everything else here: the offline page's comment QUOTES the
    // over-promising sentence it rejects, and a rejected example must not fail
    // the rule it exists to document.
    const REPLY = code(readFileSync(
      join(ROOT, 'src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx'),
      'utf8',
    ));
    const BANNER = code(readFileSync(
      join(ROOT, 'src/app/admin/(protected)/ConnectionBanner.tsx'),
      'utf8',
    ));
    for (const [name, source] of [['offline page', OFFLINE], ['reply form', REPLY], ['banner', BANNER]] as const) {
      // "will be sent on its own", "saved automatically", "nothing was lost".
      expect(source, `${name} implies a queue`).not.toMatch(/ser[áa] enviad[ao] (?:automaticamente|sozinh)/i);
      expect(source, `${name} claims an autosave`).not.toMatch(/salv[ao] automaticamente|fica salvo|est[áa] salvo/i);
      // Wide gap and several verb endings on purpose: the exact sentence this
      // plan warns about — "Nada do que você já enviou foi perdido" — puts 26
      // characters between the two words, so a tight window would have let the
      // one named failure through.
      expect(source, `${name} claims nothing was lost`).not.toMatch(/n[ãa]da\b[\s\S]{0,60}perd(?:id|eu|er)/i);
    }
  });

  it('the send button and the Enter path both refuse while offline', () => {
    const REPLY = readFileSync(
      join(ROOT, 'src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx'),
      'utf8',
    );
    expect(REPLY).toContain('disabled={pending || !online}');
    // Enter is the fast path; without this guard it fires a doomed submit and
    // react-dom's form reset empties the textarea for nothing.
    expect(REPLY).toMatch(/if \(!online\) return;/);
  });
});

describe('iOS home screen', () => {
  it('declares appleWebApp, because iOS ignores the manifest', () => {
    expect(LAYOUT).toMatch(/appleWebApp:\s*\{[^}]*capable:\s*true/);
  });

  it('ships an apple-touch-icon source', () => {
    expect(existsSync(join(ROOT, 'src/app/apple-icon.tsx'))).toBe(true);
  });
});
