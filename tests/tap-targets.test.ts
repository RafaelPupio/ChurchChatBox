import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A STATIC CONTRACT over the stylesheet's text — not a measurement.
 *
 *  There is no browser harness and no jsdom in this repo, and jsdom would not
 *  help: it has no layout engine, so nothing here can measure a rendered tap
 *  target, an overflow or a font size. What these assertions do is stop the
 *  declarations that make the panel usable with a thumb from being quietly
 *  dropped again — the 44px floor, the 16px input floor that keeps iOS from
 *  zooming on focus, and the separation between the two reorder arrows.
 *
 *  The real check is a phone at 375px, and it is a manual one. */

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const MENU_LIST = readFileSync(
  join(process.cwd(), 'src/app/admin/(protected)/conteudo/MenuList.tsx'),
  'utf8',
);

/** The declarations of the first rule whose selector list starts with `selector`. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}[^{]*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No rule found for selector starting with: ${selector}`);
  return match[1];
}

describe('tap targets', () => {
  it('declares the 44px floor as a token', () => {
    expect(CSS).toMatch(/--tap:\s*44px/);
  });

  it.each(['button', '.btnlink', '.nav a', '.conv'])('%s is at least one tap tall', (selector) => {
    expect(ruleFor(selector)).toMatch(/min-height:\s*var\(--tap\)/);
  });

  it.each(['button', '.btnlink'])('%s is at least one tap wide', (selector) => {
    // An icon-only control — the ▲ and ▼ reorder buttons — is otherwise as narrow
    // as its glyph.
    expect(ruleFor(selector)).toMatch(/min-width:\s*var\(--tap\)/);
  });

  it('keeps the reorder arrows a thumb-width apart', () => {
    const gap = MENU_LIST.match(/flexDirection:\s*'column',\s*gap:\s*(\d+)/);
    expect(gap).not.toBeNull();
    // Each press is an immediate server write against the live WhatsApp menu.
    expect(Number(gap?.[1])).toBeGreaterThanOrEqual(8);
  });
});

describe('iOS focus zoom', () => {
  it('states 16px on text fields rather than inheriting it', () => {
    expect(ruleFor('input[type=text]')).toMatch(/font-size:\s*16px/);
  });

  it('no field is declared below 16px anywhere in the sheet', () => {
    // Below 16px, iOS Safari zooms the page on focus and does not zoom back.
    for (const rule of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const [, selector, body] = rule;
      if (!/\b(input|textarea|select)\b/.test(selector)) continue;
      const size = body.match(/font-size:\s*(\d+)px/);
      if (size) expect(Number(size[1])).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('nav overflow', () => {
  it('the nav wraps instead of running off the side of a phone', () => {
    // Its eight children already measured past 375px before these controls grew
    // to 44px; without wrapping this change would have pushed more of them
    // off-screen. Do not "fix" that with overflow-x: hidden — it hides the bug
    // and silently breaks position: sticky for every descendant.
    expect(ruleFor('.nav')).toMatch(/flex-wrap:\s*wrap/);
    expect(CSS).not.toMatch(/overflow-x:\s*hidden/);
  });
});
