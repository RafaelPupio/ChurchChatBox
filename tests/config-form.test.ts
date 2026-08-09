import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A STATIC CONTRACT over Configurações' bot-text form.
 *
 *  Grouping the ten fields into collapsible sections introduced one way to lose
 *  data that the flat list did not have: a field that stops being rendered stops
 *  being submitted, and `saveTexts` reads a missing field as the empty string.
 *  What the church's bot says to its members is on the other side of that.
 *
 *  So the field set is checked against the action that writes it, across the two
 *  files, rather than trusted to match by eye. */

const CONFIG = join(process.cwd(), 'src/app/admin/(protected)/configuracoes');
const FORM = readFileSync(join(CONFIG, 'TextsForm.tsx'), 'utf8');
const ACTIONS = readFileSync(join(CONFIG, 'actions.ts'), 'utf8');

/** The column names TextsForm renders an input or textarea for. */
function fieldsRenderedByTheForm(): Set<string> {
  const fromGroups = [...FORM.matchAll(/\{\s*name:\s*'([^']+)'\s*,\s*label:/g)].map((m) => m[1]);
  // The church name sits outside the groups, on its own input.
  const standalone = [...FORM.matchAll(/<input[^>]*\sname="([^"]+)"/g)].map((m) => m[1]);
  return new Set([...fromGroups, ...standalone]);
}

/** The column names saveTexts writes: its TEXT_FIELDS list plus the two it
 *  validates separately. */
function fieldsWrittenByTheAction(): Set<string> {
  const list = ACTIONS.match(/const TEXT_FIELDS = \[([\s\S]*?)\] as const;/);
  expect(list, 'TEXT_FIELDS moved or was renamed in actions.ts').not.toBeNull();
  const names = [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return new Set([...names, 'name', 'menuButtonLabel']);
}

describe('every bot text still reaches the database', () => {
  it('the form renders exactly the fields saveTexts writes', () => {
    // A group dropped in a refactor takes its fields out of the FormData with it.
    // saveTexts would then either refuse the save with "Há um campo em branco"
    // or, for a field with no validator, quietly store ''.
    expect([...fieldsRenderedByTheForm()].sort()).toEqual([...fieldsWrittenByTheAction()].sort());
  });

  it('collapses sections instead of unmounting them', () => {
    // THE load-bearing detail of this screen. A collapsed <details> keeps its
    // inputs in the DOM, so closed sections are still submitted. Swapping it for
    // `{open && <fields/>}` would blank nine texts on the first save of the tenth,
    // with a success message.
    expect(FORM).toMatch(/<details/);
    expect(FORM).not.toMatch(/\{\s*open\s*&&/);
  });
});

describe('unsaved changes are visible and survive a back-swipe', () => {
  it('arms the browser prompt, and only while something is dirty', () => {
    // An accidental iOS back-swipe used to discard ten edited boxes in silence.
    // The listener must be conditional: armed permanently, it would prompt on
    // every navigation away from an untouched screen.
    expect(FORM).toMatch(/addEventListener\('beforeunload'/);
    expect(FORM).toMatch(/if \(dirty\.length === 0\) return;/);
    expect(FORM).toMatch(/removeEventListener\('beforeunload'/);
  });

  it('keeps the save control on screen', () => {
    // It used to sit 1405px down the page, below every field.
    expect(FORM).toMatch(/className="savebar"/);
  });
});
