import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A STATIC CONTRACT over the Caixa screens' source text, in the same spirit as
 *  tests/conteudo-form.test.ts and for the same reason: this repo has no browser
 *  harness and no jsdom, so nothing here can assert what a secretary sees.
 *
 *  What it does is stop a specific class of regression. The mobile plan
 *  (docs/superpowers/plans/2026-08-08-mobile-and-pwa.md) carries literal
 *  replacement source for every file below, and that source was written BEFORE
 *  the draft mirror, the bounded thread window and the id-keyed scroll anchor
 *  shipped. Pasting it verbatim — which is what a later task or a re-run of this
 *  plan would naturally do — reverts all three, silently and with a green suite.
 *  Each assertion below names the shipped decision it is holding open. */

const CAIXA = join(process.cwd(), 'src/app/admin/(protected)/caixa');
const read = (path: string) => readFileSync(join(CAIXA, path), 'utf8');

/** Comments out, code in — several assertions below are "this must NOT appear",
 *  and the clearest way to document a rejected alternative is to name it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const REPLY_FORM = code(read('[contactId]/ReplyForm.tsx'));
const THREAD_PAGE = code(read('[contactId]/page.tsx'));
const THREAD_BOTTOM = code(read('[contactId]/ThreadBottom.tsx'));
const LIST_PAGE = code(read('page.tsx'));

describe('the reply composer', () => {
  it('still mirrors the draft, so a failed send does not eat her message', () => {
    // react-dom clears an uncontrolled textarea on EVERY submit, outcome
    // irrespective. Without this mirror a refused send leaves an error message
    // above an empty box and no copy of the text anywhere. The plan's own
    // composer snippet has no draft handling at all.
    expect(REPLY_FORM).toMatch(/from '@\/lib\/draft'/);
    expect(REPLY_FORM).toMatch(/draftEffect\(/);
    expect(REPLY_FORM).toMatch(/sessionDraftStore\(\)/);
  });

  it('is a sticky composer, not a form at the foot of the history', () => {
    expect(REPLY_FORM).toMatch(/className="card composer"/);
    expect(REPLY_FORM).toMatch(/className="composer-input"/);
  });

  it('sends on Enter without sending a half-typed word', () => {
    expect(REPLY_FORM).toMatch(/enterKeyHint="send"/);
    // requestSubmit, never submit(): submit() skips both the `required` check and
    // the React action, so Enter on an empty box would dispatch an empty reply.
    expect(REPLY_FORM).toMatch(/requestSubmit\(\)/);
    expect(REPLY_FORM).not.toMatch(/\.submit\(\)/);
    // Android predictive keyboards fire Enter to commit the word being typed.
    expect(REPLY_FORM).toMatch(/isComposing/);
  });
});

describe('the thread screen', () => {
  it('uses the compact header, not the row that put the button on its own line', () => {
    expect(THREAD_PAGE).toMatch(/className="thread-head"/);
    expect(THREAD_PAGE).toMatch(/className="thread-title"/);
    // `.row > .grow { flex-basis: 100% }` on a phone would have pushed Encerrar
    // below a wrapped name — the header this replaces measured ~180px.
    expect(THREAD_PAGE).not.toMatch(/<div className="row">\s*<h1 className="grow">/);
  });

  it('anchors the scroll on the newest message id, not on how many there are', () => {
    // A truncated thread returns exactly THREAD_WINDOW rows forever, so the count
    // stops changing the moment the bound bites and the anchor dies with it. The
    // plan's ThreadBottom takes `count`; this one must not.
    expect(THREAD_BOTTOM).toMatch(/newestId/);
    expect(THREAD_BOTTOM).not.toMatch(/\bcount\b/);
    expect(THREAD_PAGE).toMatch(/newestId=\{threadAnchorKey\(/);
  });

  it('keeps the way back into a truncated history', () => {
    // The plan's page.tsx predates the bounded thread query and renders neither.
    expect(THREAD_PAGE).toMatch(/requestedThreadWindow\(/);
    expect(THREAD_PAGE).toMatch(/convo\.truncated/);
  });
});

describe('both Caixa screens poll', () => {
  it.each([
    ['the thread', () => THREAD_PAGE],
    ['the list', () => LIST_PAGE],
  ])('%s mounts AutoRefresh', (_name, source) => {
    // Nothing pushes an inbound WhatsApp message into an open panel. A screen
    // without this is a snapshot of whenever it happened to load.
    expect(source()).toMatch(/<AutoRefresh/);
  });

  it('the thread tunes the cadence rather than switching the poll off', () => {
    // A boolean gate once turned polling off for bot-mode contacts, which killed
    // the update for the escalation moment — the one event worth watching for.
    expect(THREAD_PAGE).toMatch(/intervalMs=\{pollMs\}/);
    expect(THREAD_PAGE).toMatch(/threadPollMs\(/);
  });
});
