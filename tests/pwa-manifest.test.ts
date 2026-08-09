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

describe('iOS home screen', () => {
  it('declares appleWebApp, because iOS ignores the manifest', () => {
    expect(LAYOUT).toMatch(/appleWebApp:\s*\{[^}]*capable:\s*true/);
  });

  it('ships an apple-touch-icon source', () => {
    expect(existsSync(join(ROOT, 'src/app/apple-icon.tsx'))).toBe(true);
  });
});
