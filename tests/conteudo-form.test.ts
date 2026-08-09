import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A STATIC CONTRACT over the Conteúdo screens' source text — not a rendering
 *  test. There is no browser harness and no jsdom in this repo, so nothing here
 *  can assert what a secretary sees. What it does is stop three decisions from
 *  being quietly reversed: the type question is gone, the fields that discarded
 *  her writing are gone, and no client component drags node:crypto into the
 *  browser bundle. */

const CONTEUDO = join(process.cwd(), 'src/app/admin/(protected)/conteudo');
const read = (name: string) => readFileSync(join(CONTEUDO, name), 'utf8');

/** Comments out, code in. Every assertion below is about what these files DO, and
 *  several of them are phrased as "this string must not appear" — which collides
 *  head-on with the fact that the clearest way to document a deleted landmine is
 *  to name it. item-actions.ts explains why there is no `parseKind`;
 *  BehaviourItemForm.tsx explains that the handback carries no `name="bodyText"`.
 *  Read raw, those two comments fail the two assertions they are describing, and
 *  the only ways out are to delete the record of why or to weaken the check.
 *  Stripping first keeps both: prose may name the danger, code may not contain
 *  it. The `[^:]` guard keeps a `//` inside a URL from eating the rest of a line. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ITEM_FORM = code(read('ItemForm.tsx'));
const BEHAVIOUR_FORM = code(read('BehaviourItemForm.tsx'));
const ITEM_ACTIONS = code(read('item-actions.ts'));
const ADD_BEHAVIOUR = code(read('AddBehaviourItems.tsx'));
const EDIT_PAGE = code(read('[id]/page.tsx'));

describe('the type question is gone', () => {
  it('no form renders a kind control', () => {
    for (const source of [ITEM_FORM, BEHAVIOUR_FORM]) {
      expect(source).not.toMatch(/<select/);
      expect(source).not.toMatch(/name="kind"/);
    }
  });

  it('no server action reads a kind out of the request', () => {
    // parseKind returned 'content' for a missing field. Left in place, deleting
    // the dropdown would have converted every prayer item to content on its first
    // save — the bot stops asking for prayer requests, and nothing says so.
    expect(ITEM_ACTIONS).not.toMatch(/parseKind/);
    expect(ITEM_ACTIONS).not.toMatch(/get\(\s*['"]kind['"]\s*\)/);
  });

  it('createItem hard-codes content and editItem takes the kind from the row', () => {
    expect(ITEM_ACTIONS).toMatch(/kind:\s*'content'/);
    expect(ITEM_ACTIONS).toMatch(/current\.kind/);
  });
});

describe('the behaviour form shows nothing that does nothing', () => {
  it('has no reply text and no image upload', () => {
    // menu-router.ts reads neither bodyText nor imageUrl for prayer/human, and
    // validateMenuItemContent returns null for them. Rendering those controls
    // accepted her writing and discarded it silently.
    expect(BEHAVIOUR_FORM).not.toMatch(/name="bodyText"/);
    expect(BEHAVIOUR_FORM).not.toMatch(/type="file"/);
    expect(BEHAVIOUR_FORM).not.toMatch(/name="imageUrl"/);
  });

  it('says where the reply really comes from', () => {
    expect(BEHAVIOUR_FORM).toMatch(/Configurações/);
    expect(BEHAVIOUR_FORM).toMatch(/settingsField/);
  });

  it('hands back writing an older version of this form stored on the row', () => {
    // Removing the fields stops NEW losses. Rows that already carry text or an
    // image would otherwise become unreachable from the panel, recoverable only
    // by a human remembering to run a SELECT — which is not a fix. The edit page
    // has the row in hand, so it passes it down and the form shows it.
    expect(BEHAVIOUR_FORM).toMatch(/orphanBodyText/);
    expect(BEHAVIOUR_FORM).toMatch(/orphanImageUrl/);
    expect(EDIT_PAGE).toMatch(/orphanBodyText=\{item\.bodyText\}/);
    expect(EDIT_PAGE).toMatch(/orphanImageUrl=\{item\.imageUrl\}/);
    // Shown, never resubmitted: editItem's behaviour branch writes { label } only.
    expect(BEHAVIOUR_FORM).not.toMatch(/name="orphan/);
  });

  it('the old "leave it blank" hint is gone from the content form', () => {
    expect(ITEM_FORM).not.toMatch(/Deixe em branco/);
  });
});

describe('a message about a write outlives the thing that triggered it', () => {
  it('addBehaviourItem redirects instead of returning a success message', () => {
    // AddBehaviourItems renders only while a kind is missing. Adding the LAST
    // missing kind unmounts it, so a notice returned into its state disappears
    // before it can be read — and the church at 10 active items gets a hidden
    // item and silence, which is the failure the notice existed to prevent.
    expect(ITEM_ACTIONS).toMatch(/redirect\(`\/admin\/conteudo\?criado=\$\{created\.id\}`\)/);
    // A field or a property access, never the word itself: both files say
    // "notice" in prose on purpose, and `code()` above has already dropped it.
    expect(ITEM_ACTIONS).not.toMatch(/notice\??:/);
    expect(ADD_BEHAVIOUR).not.toMatch(/notice\??:/);
    expect(ADD_BEHAVIOUR).not.toMatch(/\.notice/);
  });

  it('the list page is what renders it', () => {
    const page = read('page.tsx');
    expect(page).toMatch(/criado/);
    expect(page).toMatch(/created\.isActive/);
  });
});

describe('client bundle safety', () => {
  it('no client component under conteudo/ imports @/lib/whatsapp', () => {
    // src/lib/whatsapp.ts line 1 is `import crypto from 'node:crypto'`. The row
    // title cap and truncation live in @/lib/list-row-title for this reason.
    const offenders = readdirSync(CONTEUDO)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => {
        // Stripped for the same reason as above: a commented-out import ships
        // nothing, and mentioning the module in prose is not an offence.
        const source = code(read(f));
        return /^['"]use client['"]/m.test(source) && /from\s+['"]@\/lib\/whatsapp['"]/.test(source);
      });
    expect(offenders).toEqual([]);
  });

  it('the panel truncates with the same function the sender uses', async () => {
    const fromSender = await import('@/lib/whatsapp');
    const fromPanel = await import('@/lib/list-row-title');
    // Same identity, not merely the same behaviour: a preview that can drift from
    // what members receive is worse than no preview, because she would trust it.
    expect(fromSender.truncateRowTitle).toBe(fromPanel.truncateRowTitle);
    expect(fromSender.LIST_ROW_TITLE_MAX).toBe(fromPanel.LIST_ROW_TITLE_MAX);
  });
});

describe('the image accept attribute survived', () => {
  it('still names concrete formats rather than image/*', () => {
    // Shipped in d7fd532: `image/*` is what makes an iPhone hand over a HEIC the
    // WhatsApp API cannot render. Mobile-plan Task 9's snippet would revert this.
    expect(ITEM_FORM).toMatch(/IMAGE_ACCEPT_ATTRIBUTE/);
    expect(ITEM_FORM).not.toMatch(/accept="image\/\*"/);
  });
});

describe('the image is converted before it is judged', () => {
  it('prepareImage runs ahead of validateImageFile', () => {
    // THE trap in this flow, and it is silent when you get it wrong: the pre-upload
    // check rejects HEIC by design, correctly, because for a long time nothing
    // could convert one. Run it first and it goes on rejecting exactly the photos
    // the converter was added to rescue, the feature is dead code, and every test
    // still passes. The order of these two calls is the feature.
    const convert = ITEM_FORM.indexOf('prepareImage(');
    const check = ITEM_FORM.indexOf('validateImageFile(');
    expect(convert, 'ItemForm no longer converts the picked photo').toBeGreaterThan(-1);
    expect(check, 'ItemForm no longer checks the file it is about to upload').toBeGreaterThan(-1);
    expect(convert).toBeLessThan(check);
  });

  it('uploads the prepared file, not the one the picker handed over', () => {
    // Uploading `file` after converting into `prepared.file` would send the 8 MB
    // HEIC anyway — a conversion that runs, succeeds, and is thrown away.
    expect(ITEM_FORM).toMatch(/upload\(\s*prepared\.file\.name,\s*prepared\.file/);
  });

  it('the route is still narrow, so no HEIC can reach the blob store', () => {
    // The fix this task exists to argue against is widening allowedContentTypes:
    // it makes the upload succeed and the DELIVERY fail, so the church posts its
    // calendar, sees a success message, and no member ever receives it.
    const route = readFileSync(join(process.cwd(), 'src/app/api/blob/upload/route.ts'), 'utf8');
    expect(route.toLowerCase()).not.toContain('heic');
  });
});
