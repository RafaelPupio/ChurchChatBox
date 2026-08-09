import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** globals.css is the only place the panel's responsive behaviour lives, and no
 *  test in this repo can render a browser: vitest runs in the node environment,
 *  and jsdom would not help either — it has no layout engine, so it cannot
 *  measure an overflow, a tap target or a wrapped row.
 *
 *  So this suite asserts the DECLARATIONS instead. Each one below is the direct
 *  fix for a finding in the 2026-08-08 mobile audit; deleting any of them
 *  reintroduces a specific, named bug on a secretary's phone. */

/** Comments are stripped FIRST, and that is load-bearing, not tidiness. The rule
 *  regex below captures everything between the previous `}` and the `{` as the
 *  selector, so a block comment sitting above a rule becomes part of its selector
 *  text and the rule stops being findable. This stylesheet documents most of its
 *  non-obvious declarations, so without this line `.row`, `.grow`, `body`,
 *  `.iconbtn`, `.container` and the input deny-list are all unreachable.
 *
 *  Stripping first also keeps prose out of the whole-file assertions further
 *  down — a comment that merely *mentions* `overflow` or a font size can no
 *  longer trip them. */
const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Index just past the `}` that closes the block whose `{` is at `open`. */
function endOfBlock(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`Unbalanced braces starting at ${open}`);
}

/** The stylesheet with every @media block removed.
 *
 *  This is the default scope for block(), and it is the second half of the same
 *  bug: `.thread`, `.container`, `.tabbar` and `.composer` are each declared twice
 *  — once as the base rule and once as a phone override. A plain first-match over
 *  the raw file happens to return the base rule for some and the override for
 *  others, purely by which one a comment is sitting above. Asserting `60vh`
 *  against a rule that says `52dvh` is a passing-looking test of the wrong thing,
 *  so global lookups only ever see base rules, and overrides are asked for
 *  explicitly via block(sel, media(...)). */
const BASE = (() => {
  let out = CSS;
  for (let at = out.indexOf('@media'); at !== -1; at = out.indexOf('@media')) {
    const open = out.indexOf('{', at);
    if (open === -1) throw new Error('@media with no block');
    out = out.slice(0, at) + out.slice(endOfBlock(out, open));
  }
  return out;
})();

/** Body of the first rule whose selector list matches `selector` exactly, ignoring
 *  whitespace. Defaults to the media-free base stylesheet; pass media(...) as the
 *  scope to assert a phone override. */
function block(selector: string, scope: string = BASE): string {
  for (const [, sel, body] of scope.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel.replace(/\s+/g, ' ').trim() === selector) return body;
  }
  throw new Error(`No CSS rule for selector: ${selector}`);
}

/** Text inside `@media <prelude> { ... }`. */
function media(prelude: string): string {
  const at = CSS.indexOf(`@media ${prelude}`);
  expect(at, `missing @media ${prelude}`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', at);
  return CSS.slice(open + 1, endOfBlock(CSS, open) - 1);
}

describe('layout primitives', () => {
  it('.row wraps — the single fix for four audit blockers', () => {
    expect(block('.row')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('.grow can shrink below its min-content width', () => {
    expect(block('.grow')).toMatch(/min-width:\s*0/);
  });

  it('the growing child claims a full line on phones', () => {
    expect(block('.row > .grow', media('(max-width: 640px)'))).toMatch(/flex-basis:\s*100%/);
  });

  it('the primary call to action goes full width on phones ONLY', () => {
    // The tempting version of this was className="btnlink primary grow", which
    // also gives the link flex: 1 at desktop width beside the <h1 class="grow">
    // and splits the 880px header 50/50 — a 430px "+ Novo item" button.
    expect(block('.row > .btnlink.primary', media('(max-width: 640px)'))).toMatch(/flex:\s*1 1 100%/);
    expect(BASE).not.toMatch(/\.row\s*>\s*\.btnlink\.primary/);
  });

  it('never hides overflow on body or html', () => {
    // overflow-x: hidden masks the bug AND breaks position: sticky for every
    // descendant, which the app bar, composer and save bar all rely on.
    expect(block('body')).not.toMatch(/overflow/);
    expect(CSS).not.toMatch(/\bhtml\s*\{[^}]*overflow/);
  });
});

describe('tap targets', () => {
  it('declares a 44px minimum', () => {
    expect(block(':root')).toMatch(/--tap:\s*44px/);
  });

  it.each(['button', '.btnlink', '.tabbar a', '.back'])('%s is at least --tap tall', (selector) => {
    expect(block(selector)).toMatch(/min-height:\s*var\(--tap\)/);
  });

  it('.iconbtn is a full square', () => {
    const body = block('.iconbtn');
    expect(body).toMatch(/min-width:\s*var\(--tap\)/);
    expect(body).toMatch(/min-height:\s*var\(--tap\)/);
  });

  it('.item-actions keeps at least 8px between the reorder buttons', () => {
    // >= 8px, not == 8px. The Conteúdo plan (2026-08-08-conteudo-simpler.md,
    // Task 5) ships this rule first at 10px, measured for two adjacent 44px
    // targets whose mis-tap is an immediate server write reordering the live
    // menu. Pinning the exact value would fail against the stricter spacing.
    const gap = /gap:\s*(\d+)px/.exec(block('.item-actions'));
    expect(gap).not.toBeNull();
    expect(Number(gap![1])).toBeGreaterThanOrEqual(8);
  });
});

describe('typography floors', () => {
  it('form fields are selected by deny-list, not an allow-list', () => {
    // The allow-list let input[type=file] fall to 13.3px and would have let any
    // future tel/number/date input do the same — which makes iOS zoom on focus.
    expect(CSS).toContain('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file])');
    expect(CSS).not.toContain('input[type=text], input[type=email], input[type=password]');
  });

  it('every field type is pinned at 16px', () => {
    expect(block('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), textarea, select'))
      .toMatch(/font-size:\s*16px/);
    expect(block('input[type=file]')).toMatch(/font-size:\s*16px/);
  });

  it('no rule anywhere sets text below 12px', () => {
    const tooSmall = [...CSS.matchAll(/font-size:\s*(\d+)px/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px < 12);
    expect(tooSmall).toEqual([]);
  });
});

describe('phone chrome', () => {
  const mobile = media('(max-width: 640px)');

  it('the tab bar is pinned to the bottom of the phone viewport', () => {
    expect(block('.tabbar', mobile)).toMatch(/position:\s*fixed/);
  });

  it('the tab bar clears the iPhone home indicator', () => {
    expect(block('.tabbar', mobile)).toContain('env(safe-area-inset-bottom)');
  });

  it('page content reserves room for the tab bar', () => {
    const body = block('.container', mobile);
    expect(body).toContain('var(--tabbar-h)');
    expect(body).toContain('env(safe-area-inset-bottom)');
  });

  it('the composer and save bar sit above the tab bar', () => {
    expect(block('.composer, .savebar', mobile)).toContain('var(--tabbar-h)');
  });
});

describe('conversation thread', () => {
  it('scrolls inside itself instead of pushing the reply box off-screen', () => {
    const body = block('.thread');
    expect(body).toMatch(/max-height:\s*60vh/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it('measures itself against the dynamic viewport, with a vh fallback', () => {
    // vh is frozen at the tallest-chrome height on iOS; dvh follows the real one.
    expect(block('.thread')).toMatch(/max-height:\s*60dvh/);
  });

  it('does not rubber-band the page when it hits its end', () => {
    expect(block('.thread')).toMatch(/overscroll-behavior:\s*contain/);
  });

  it('the composer sticks to the bottom of the viewport', () => {
    expect(block('.composer')).toMatch(/position:\s*sticky/);
  });
});

describe('software keyboard', () => {
  const mobile = media('(max-width: 640px)');

  it('declares the keyboard inset with a safe default', () => {
    // 0px is the no-JS, no-keyboard, desktop value, so every calc() below stays
    // valid even if KeyboardInset never mounts.
    expect(block(':root')).toMatch(/--kb:\s*0px/);
  });

  it('the composer rides above the keyboard rather than under it', () => {
    // iOS does not shrink the LAYOUT viewport when the keyboard opens, so
    // bottom: 0 leaves the composer behind the keys.
    expect(block('.composer')).toMatch(/bottom:\s*var\(--kb\)/);
    expect(block('.savebar')).toMatch(/bottom:\s*var\(--kb\)/);
    expect(block('.composer, .savebar', mobile)).toContain('var(--kb)');
  });

  it('the tab bar gets out of the way while typing', () => {
    expect(block('html.keyboard-open .tabbar', mobile)).toMatch(/display:\s*none/);
    expect(block('html.keyboard-open .composer, html.keyboard-open .savebar', mobile))
      .toMatch(/bottom:\s*var\(--kb\)/);
  });

  it('the thread yields the space the keyboard took', () => {
    expect(block('html.keyboard-open .thread', mobile)).toContain('var(--kb)');
  });
});

describe('no desktop regression from the phone rules', () => {
  const CONTEUDO = readFileSync(
    join(process.cwd(), 'src/app/admin/(protected)/conteudo/page.tsx'),
    'utf8',
  );

  it('the "+ Novo item" link is not a flex grower', () => {
    // Full width on a phone is a media-query job. Putting .grow on the link makes
    // it a 430px button beside the <h1 class="grow"> at 880px.
    expect(CONTEUDO).not.toMatch(/btnlink primary grow/);
  });
});
