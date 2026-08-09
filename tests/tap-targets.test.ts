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
const PRAYER_LIST = readFileSync(
  join(process.cwd(), 'src/app/admin/(protected)/oracao/PrayerList.tsx'),
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

  it('the file picker BUTTON carries its own floor, not just its input', () => {
    // The 44px on the input is only reliably the hit target in Chromium; on iOS
    // Safari the tappable thing is the button, which computed to 33px. Note the
    // limit honestly: ::file-selector-button needs Safari 16+ / Firefox, and on
    // anything older this control really is below the floor. Nothing in this file
    // should be read as proof that every control is 44px on every phone.
    expect(ruleFor('input[type=file]::file-selector-button')).toMatch(
      /min-height:\s*var\(--tap\)/,
    );
  });

  it('keeps the reorder arrows a thumb-width apart', () => {
    // The spacing moved from an inline style to the .item-actions gap when the
    // row became two lines. Assert it where it now lives, and assert the arrows
    // actually opt into the class that carries it.
    expect(MENU_LIST).toMatch(/className="iconbtn"/);
    const gap = ruleFor('.item-actions').match(/gap:\s*(\d+)px/);
    expect(gap).not.toBeNull();
    // Each press is an immediate server write against the live WhatsApp menu.
    expect(Number(gap?.[1])).toBeGreaterThanOrEqual(8);
  });
});

describe('iOS focus zoom', () => {
  it('states 16px on text fields rather than inheriting it', () => {
    // The selector this used to name — `input[type=text], input[type=email],
    // input[type=password]` — was an ALLOW-list, and the mobile pass replaced it
    // with the deny-list below. That is why this assertion moved: it is the same
    // 16px floor on a strictly wider set of fields. The allow-list let
    // input[type=file] fall through to the browser's ~13.3px default, and would
    // have let any future tel/number/date/search field do the same.
    expect(
      ruleFor('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file])'),
    ).toMatch(/font-size:\s*16px/);
    expect(ruleFor('input[type=file]')).toMatch(/font-size:\s*16px/);
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

describe('horizontal overflow', () => {
  /** Also a static contract, and it is worth saying plainly what it is not: these
   *  three assertions cannot tell you the page fits. Nothing in this repo can —
   *  there is no layout engine here. The page was MEASURED in a real browser at a
   *  375px viewport against this stylesheet, with the full MenuList row (▲▼ +
   *  label + .chip + Ocultar + Editar):
   *
   *    before  label "Acompanhamento"   document.scrollWidth 375 (2.1px of slack)
   *    before  label "Acompanhamentos"  document.scrollWidth 381  ← overflow
   *    before  one long unbreakable word          scrollWidth 501
   *    after   every one of the above              scrollWidth 375
   *
   *  What these assertions do is stop the three declarations that produced the
   *  "after" column from being dropped again. */
  it('.grow can shrink below its longest word', () => {
    // `flex: 1` leaves min-width at `auto`, whose used value for a flex item is
    // its min-content size. That floor is what pushed the controls after the
    // label off the side of the page.
    expect(ruleFor('.grow')).toMatch(/min-width:\s*0/);
  });

  it('.grow breaks a word that still cannot fit', () => {
    expect(ruleFor('.grow')).toMatch(/overflow-wrap:\s*(break-word|anywhere)/);
  });

  it('.row.wrap gives a crowded row a second line, with a floor to trigger it', () => {
    // min-width: 0 alone only relocates the damage: measured, the label collapsed
    // to 33.6px and rendered "Acompanhamento" as a 132px-tall column of single
    // letters. The wrap needs a floor on the label, because a zero flex-basis
    // always "fits" and so never causes a line break.
    expect(ruleFor('.row.wrap')).toMatch(/flex-wrap:\s*wrap/);
    expect(ruleFor('.row.wrap > .grow')).toMatch(/min-width:\s*[1-9]/);
  });

  it('the rows that were measured over-wide actually opt in', () => {
    // MenuList no longer shares one line at all: the name gets its own row above
    // the controls, so it opts into .item-card rather than .row.wrap. The floor
    // that used to trigger the wrap is replaced by the label owning the line.
    expect(MENU_LIST).toMatch(/className="card item-card"/);
    expect(ruleFor('.item-label')).toMatch(/min-width:\s*0/);
    expect(ruleFor('.item-label')).toMatch(/overflow-wrap:\s*(break-word|anywhere)/);
    // PrayerList still uses the wrapping single row; mobile-plan Task 5 owns it.
    expect(PRAYER_LIST).toMatch(/className="card row wrap"/);
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
