# Conteúdo — Fewer Questions, Asked Later

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A church secretary opens `/admin/conteudo` to add the service times and is asked two questions — what it is called, and what the answer is. Not four. Nothing on screen accepts her writing and throws it away, nothing lectures her about a limit she is nine items away from, and the one rule that really bites (WhatsApp cuts a row title at 24 characters) is answered on her behalf instead of left invisible.

**Architecture:** No new route, no new page, no schema change, no migration, no backfill script. The change is subtractive in the form and additive in the list: the `Tipo` dropdown is deleted outright and the two behaviour items a church needs exactly one of — `Pedido de oração` and `Falar com atendente` — become named one-tap buttons on the list page, offered only while the church lacks them. `kind` stops travelling in the request and starts coming from the row, which is what makes the dropdown deletable without silently converting existing items. Everything that used to be stated on arrival is moved to the moment it becomes true.

**Tech Stack:** Next.js 15.5 App Router · React 19 · TypeScript strict · plain CSS in one stylesheet · Vitest

**Scope:** `/admin/conteudo` and its two child routes only. This plan changes **no bot output**: `menu-router.ts`, `whatsapp.ts`'s payload builders, and every `church.*` text column are untouched in behaviour. It writes no data outside normal panel use.

**Origin:** three independent design passes over this screen, reconciled here. Where they disagreed, this plan makes one call and says why in the task that implements it.

---

## Global Constraints

- **ALL user-facing text is Brazilian Portuguese**, written for a non-technical volunteer. English only in code comments, identifiers, tests and docs. Every string added by this plan is pt-BR and is listed verbatim in the task that adds it.
- **"dízimo" must never appear anywhere user-facing.** Nothing here adds bot copy, but the constraint stands over every string in this plan. Grep for it before the final commit.
- **Any new page under `src/app/admin/(protected)` MUST import `requireReadableSession`, or the suite fails.** `tests/privilege-boundary.test.ts`'s `admin read guard` block walks every `page.tsx` under that tree and asserts each one both imports `@/lib/auth/writable` and contains the literal identifier `requireReadableSession`, unless it is listed in `NO_CHURCH_DATA`. **Read that test before starting.** This plan **adds no `page.tsx` anywhere.** It modifies three that already exist (`conteudo/page.tsx`, `conteudo/novo/page.tsx`, `conteudo/[id]/page.tsx`) and all three already import and call the guard — every task below preserves those two lines verbatim. The two new files under `(protected)` (`BehaviourItemForm.tsx`, `AddBehaviourItems.tsx`) are client components, not `page.tsx` files, and are not covered by that test — they also fetch nothing. `NO_CHURCH_DATA` needs no new entry.
- **Every church-owned query stays `church_id`-scoped**, from the session, never from client input. This plan adds no repository function. It adds one call to the existing `getChurchById(churchId)` on the edit page and one to the existing `countActiveMenuItems(churchId)` on the create page. `src/lib/repo/platform.ts` is owner-only and nothing here imports it.
- **neon-http has NO TRANSACTIONS** — `db.transaction()` throws. Nothing in this plan needs one: every write is a single row, and `addBehaviourItem` is idempotent by kind so a partial failure is retried by pressing the button again.
- **TypeScript strict, no `any`.** No CSS framework, no UI kit — `src/app/globals.css` is extended, per the standing argument in the mobile plan's Global Constraints.
- **A `'use client'` file must never import `@/lib/whatsapp`.** Line 1 of that file is `import crypto from 'node:crypto'`. Task 1 exists to give the client the one thing it needs from there, and Task 9 adds a test that keeps it that way.
- **The suite must not regress.** **Measure the baseline yourself at branch time — do not trust a number in this document.** When this plan was written the suite ran **28 files / 412 tests, 411 passing, 1 failing**: `tests/reset-email.test.ts > appBaseUrl > takes nothing from the request` (`expect(appBaseUrl.length).toBe(1)` got `0`). That failure is in the password-reset email path, has nothing to do with Conteúdo, and **a separate agent was actively editing `src/` while this was written** — files appeared in the test run that were not yet on disk when `ls tests/` ran seconds earlier. So the gate is *whatever Task 0 measures*, and nothing may fall below it. If you assume green, you will conclude you broke something you did not.
- **Do not run any `git` command that changes state until the commit step of the task you are on.**

---

## Reconciliation with `2026-08-08-mobile-and-pwa.md`

That plan redesigns these exact screens and **has not been executed**. Both plans cannot be followed literally. This table is binding; a per-task copy of the relevant row appears in each affected task.

| Mobile-plan task | Verdict | What the executor does |
|---|---|---|
| **Task 1** (responsive CSS foundation) | **Partially pre-empted.** | This plan's **Task 5** adds exactly six rules — `.item-card`, `.item-head`, `.item-label`, `.item-meta`, `.item-actions`, `.iconbtn` — using the *exact names from mobile Task 1's CSS contract*, plus `white-space: nowrap` on the existing `.chip`. When mobile Task 1 runs, it must **skip those six rules** and add everything else in its list unchanged. Mobile Task 1 already carries the constraint "never apply the same CSS twice"; this is that case. Nothing else in mobile Task 1 is touched. |
| **Task 4 Step 1** (MenuList rewrite) | **SUPERSEDED.** | This plan's **Task 6** produces a strict superset: same class names, same 44×44 arrows, same ≥8px separation, same `▲` disabled-first / `▼` disabled-last, same item-naming `aria-label`s. It differs in two places — the `.item-meta` content becomes a full sentence about what a tap does, and the chip/toggle vocabulary changes. **Do not run mobile Task 4 Step 1 after this.** |
| **Task 4 Step 2** (page.tsx header, "needs no edit at all") | **Still true as written, and honoured.** | That statement is about the *header flex layout*. This plan edits `conteudo/page.tsx` for content but adds **no `grow` class to the `.btnlink.primary`**, so mobile Task 1's phone-only `.row > .btnlink.primary` rule and `tests/mobile-css.test.ts`'s "`page.tsx` never contains `btnlink primary grow`" assertion both still hold. Not a contradiction — recorded so the next reader does not think it is one. |
| **Task 4 Step 3** (verify) | **Defect, fixed here.** | Mobile Task 4 was written before `tests/tap-targets.test.ts` landed (commit `52987b2`). Its rewrite breaks two assertions in that file — line 61's `/flexDirection:\s*'column',\s*gap:\s*(\d+)/` regex and line 119's `expect(MENU_LIST).toMatch(/className="card row wrap"/)` — while its Step 3 claims "all pass". They do not. This plan's **Task 6** rewrites both assertions in the same commit as the markup. |
| **Task 8** (Configurações `<details>` groups) | **Untouched, with one request.** | This plan links a behaviour item's edit screen to `/admin/configuracoes` with no fragment, and shows the church's *current* reply text inline so she does not have to hunt. `TextsForm.tsx` is rewritten wholesale by mobile Task 8, so editing it here would guarantee a conflict for zero benefit today (the page has no anchors at all right now). **Request for whoever runs mobile Task 8:** add `id={group.id}` to each `<details className="group">`. Once that lands, the two links in `src/lib/behaviour-items.ts` can become `/admin/configuracoes#oracao` and `/admin/configuracoes#atendimento` in a one-line follow-up. |
| **Task 9** (image upload) | **Kept, with a target correction and a copy correction.** | Its Step 2 targets `ItemForm.tsx`. **This plan deliberately keeps the image block in `ItemForm.tsx`** — `ItemForm` becomes the *content-item* form and nothing else moves — so mobile Task 9 Step 2 still applies verbatim after this plan lands. **One correction:** its snippet writes `accept="image/*"`, which would revert shipped commit `d7fd532`'s `IMAGE_ACCEPT_ATTRIBUTE` (`src/lib/image-upload.ts:27`) — the exact thing that makes iOS convert HEIC at pick time. Mobile Task 9's own reconcile block, case (c), says keep the shipped improvement. **Keep `IMAGE_ACCEPT_ATTRIBUTE`.** |
| Tasks 0, 2, 3, 5, 6, 7, 10–15 | **Unaffected.** | This plan touches none of their files. |

**Sequencing:** this plan and the mobile plan can run in either order. Task 5 makes this one self-contained rather than dependent on mobile Task 1 landing first — the alternative was shipping a `MenuList` whose reorder arrows sit 0px apart until an unrelated plan runs, which is worse than a small, named CSS overlap.

---

## Existing data: what happens to every row that already exists

**No migration, no backfill, no provisioning change, no script.** The database is not touched outside normal panel use. That is a deliberate choice over the alternative (seed both behaviour items at provisioning and backfill live churches), and the reasoning is in Task 2.

| Row that exists today | What happens |
|---|---|
| **The seeded 🔒 Privacidade item** (`kind: 'content'`, `PRIVACY_ITEM` in `src/lib/church-defaults.ts`) | **Nothing changes.** It is not special-cased anywhere in this plan. It keeps its full text, its image field, and its editability. One consequence worth naming: on a day-one church it is the only active item, so Task 4's new rule makes it un-hideable — which is correct, because hiding it makes `buildListPayload` throw `MenuEmptyError` and the bot answers members with body text and nothing to tap. |
| **Any `kind: 'content'` item** | Unchanged in the database. On screen it loses the `Tipo` dropdown and gains a truncation warning if its label is over 24 UTF-16 units. |
| **Any `kind: 'prayer'` / `kind: 'human'` item** | The row is **not modified**. Its `bodyText` and `imageUrl` stay exactly as they are — `editItem` builds a `{ label }`-only payload for these kinds, so nothing is blanked. They become **unreachable from the panel**: the edit screen no longer renders those two fields. Members never received them (`menu-router.ts:97-100` reads neither), so nothing changes for a single member. **Before shipping, run the read-only query in Task 9 Step 3 against the live church** and copy anything found into the Configurações field that actually owns it. |
| **A church with two or more items of the same behaviour kind** | They all keep working — `menu-router.ts` routes on `selected.kind` and does not care how many there are. The add-button for that kind simply stops being offered. Nothing auto-merges, auto-hides or auto-deletes them, and **nothing detects the condition or tells her**. That is a chosen gap, not an oversight: `neon-http` has no transactions and silently hiding rows a church created on purpose is worse than a list that looks slightly odd. |
| **A church with no prayer and no handoff item** (every freshly provisioned church, which starts with exactly one item) | Two named buttons appear below the list. One tap each. They disappear once the church has one of each. |
| **`kind` after this plan** | **Immutable.** It is set at creation and no code path changes it. Combined with the fact that **the product has no delete for menu items anywhere** — there is no `deleteMenuItem` in `src/lib/repo/menu-admin.ts` and no `db.delete(menuItem)` in the tree, and commit `4bc83aa` exists precisely to stop the UI promising one — a mis-tapped behaviour button is permanent-but-hideable. See "What gets worse". |

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/list-row-title.ts` | **new** — client-safe `LIST_ROW_TITLE_MAX` + `truncateRowTitle`, moved out of `whatsapp.ts` |
| `src/lib/whatsapp.ts` | **modify** — imports and re-exports the two names above; nothing else changes |
| `src/lib/behaviour-items.ts` | **new** — the pt-BR copy and pure helpers for the two behaviour kinds (client-safe) |
| `src/lib/menu-admin-rules.ts` | **modify** — add `canHideItem` |
| `src/app/admin/(protected)/conteudo/item-actions.ts` | **modify** — `parseKind` deleted; `kind` comes from the row; `?criado=`; `addBehaviourItem` |
| `src/app/admin/(protected)/conteudo/actions.ts` | **modify** — refuse to hide the last visible item |
| `src/app/globals.css` | **modify** — six menu-row rules (mobile Task 1's names) + `.chip { white-space: nowrap }` |
| `src/app/admin/(protected)/conteudo/MenuList.tsx` | **modify** — two-line row, behaviour sentence, location/action vocabulary |
| `src/app/admin/(protected)/conteudo/ItemForm.tsx` | **modify** — becomes the *content-item* form: no `Tipo`, truncation preview |
| `src/app/admin/(protected)/conteudo/BehaviourItemForm.tsx` | **new** — name field + what the item does + the church's current reply text |
| `src/app/admin/(protected)/conteudo/AddBehaviourItems.tsx` | **new** — the two one-tap buttons |
| `src/app/admin/(protected)/conteudo/novo/page.tsx` | **modify** — title, at-10 warning |
| `src/app/admin/(protected)/conteudo/[id]/page.tsx` | **modify** — branches on `item.kind` |
| `src/app/admin/(protected)/conteudo/page.tsx` | **modify** — the wall of text goes; banners appear when true |
| `tests/menu-admin-rules.test.ts` | **modify** — `canHideItem` |
| `tests/behaviour-items.test.ts` | **new** — copy fits the WhatsApp cap; `missingBehaviourKinds` |
| `tests/tap-targets.test.ts` | **modify** — two assertions retargeted to the new markup |
| `tests/conteudo-form.test.ts` | **new** — static contract: no `Tipo`, no dead fields, no `node:crypto` in a client bundle |

## Interfaces Reference (canonical — every task matches these exactly)

```ts
// src/lib/list-row-title.ts                                          (new, client-safe)
export const LIST_ROW_TITLE_MAX: number;                              // 24
export function truncateRowTitle(label: string): string;

// src/lib/whatsapp.ts                                                (re-exports, unchanged API)
export { LIST_ROW_TITLE_MAX, truncateRowTitle };

// src/lib/behaviour-items.ts                                         (new, client-safe)
export type BehaviourKind = 'prayer' | 'human';
export const BEHAVIOUR_KINDS: readonly BehaviourKind[];
export interface BehaviourItemCopy {
  defaultLabel: string; addButton: string; listNote: string; explanation: string; settingsField: string;
}
export const BEHAVIOUR_ITEM: Record<BehaviourKind, BehaviourItemCopy>;
export function isBehaviourKind(kind: MenuItemKind): kind is BehaviourKind;
export function missingBehaviourKinds(kinds: MenuItemKind[]): BehaviourKind[];

// src/lib/menu-admin-rules.ts                                        (added)
export function canHideItem(activeCount: number): boolean;

// src/app/admin/(protected)/conteudo/item-actions.ts
export interface ItemFormState { error?: string; notice?: string }
export function createItem(prev: ItemFormState, formData: FormData): Promise<ItemFormState>;
export function editItem(id: string, prev: ItemFormState, formData: FormData): Promise<ItemFormState>;
export function addBehaviourItem(kind: BehaviourKind): Promise<ItemFormState>;
// parseKind is DELETED.

// src/app/admin/(protected)/conteudo/ItemForm.tsx
export interface ItemFormValues { label: string; bodyText: string; imageUrl: string | null }  // `kind` removed
export function ItemForm(props: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  values: ItemFormValues; submitLabel: string;
}): JSX.Element;

// src/app/admin/(protected)/conteudo/BehaviourItemForm.tsx           (new)
export function BehaviourItemForm(props: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  kind: BehaviourKind; label: string; currentText: string;
}): JSX.Element;

// src/app/admin/(protected)/conteudo/AddBehaviourItems.tsx           (new)
export function AddBehaviourItems(props: { kinds: BehaviourKind[] }): JSX.Element;

// consumed unchanged from main:
// requireReadableSession(), requireWritableSession(), blockedMessage()   — @/lib/auth/writable
// listMenuItemsForAdmin, countActiveMenuItems, createMenuItem,
//   getNextPosition, updateMenuItem                                     — @/lib/repo/menu-admin
// getChurchById(churchId)                                               — @/lib/repo/church-admin
// canActivateAnotherItem                                                — @/lib/menu-admin-rules
// validateLabel, validateMenuItemContent                                — @/lib/validation
// IMAGE_ACCEPT_ATTRIBUTE, validateImageFile                             — @/lib/image-upload
// WHATSAPP_LIST_MAX_ROWS                                                — @/lib/whatsapp  (server only)
```

**Task dependency order is not optional.** Task 3 removes `kind` from the request *before* Task 7 removes it from the form. Reverse them and `parseKind`'s `'content'` default meets a form that no longer posts a kind: the first time anyone opens a prayer item and presses Salvar, it becomes a content item with an empty body, the bot stops asking for prayer requests, and nothing says so. Run 0 → 9 in order.

---

### Task 0: Baseline and reconnaissance

**Files:** none — this task writes nothing.

Another agent has been editing `src/` in parallel. This task establishes what "no regression" means and confirms the five facts every later task assumes.

- [ ] **Step 1: Record the real baseline**

Run: `npm test`
Write down, verbatim, in the task report: the file count, the test count, the pass count, and the name of every failing test. **That pass count is the gate for every later task.** When this plan was written it was 411 passing of 412, with `tests/reset-email.test.ts > appBaseUrl > takes nothing from the request` failing. If your numbers differ, yours are right.

Run: `npm run typecheck && npm run build`
Record whether both already pass on the branch point. If `build` already fails, fix nothing — report it and stop; you cannot tell your breakage from theirs otherwise.

- [ ] **Step 2: Confirm the five assumptions**

Each of these is load-bearing for a later task. Verify by reading, not by trusting this document.

1. `src/lib/whatsapp.ts` line 1 is `import crypto from 'node:crypto';` — Task 1's whole reason to exist.
2. `src/app/admin/(protected)/conteudo/item-actions.ts` contains `parseKind` and calls it in **both** `createItem` and `editItem`, and `editItem` passes the result to `updateMenuItem` — Task 3's landmine.
3. `src/lib/validation.ts`'s `validateMenuItemContent` returns `null` immediately when `kind !== 'content'`, and `src/lib/menu-router.ts` `case 'prayer'` / `case 'human'` read neither `bodyText` nor `imageUrl` — the justification for deleting those fields from the behaviour form.
4. `src/app/admin/(protected)/conteudo/actions.ts`'s `setItemActive` has **no** guard on the deactivation path, and `src/lib/whatsapp.ts` throws `MenuEmptyError` at zero active rows — Task 4.
5. `tests/privilege-boundary.test.ts` `admin read guard` walks `page.tsx` files only, and its `NO_CHURCH_DATA` set contains one entry. Read the whole block.

- [ ] **Step 3: Check the mobile plan has not started**

Run: `git log --oneline -20`
If any commit message matches mobile-plan Task 1 or Task 4 (`feat(conteudo): menu rows put the item name first…`, or a `globals.css` commit adding `.item-card`), **stop and re-read the reconciliation table above** before writing anything — Tasks 5 and 6 change from "add" to "reconcile with what is there".

No commit for this task.

---

### Task 1: Client-safe row-title truncation

**Files:**
- Create: `src/lib/list-row-title.ts`
- Modify: `src/lib/whatsapp.ts`

**Interfaces:**
- Produces: `LIST_ROW_TITLE_MAX`, `truncateRowTitle` from a module with no Node imports
- Consumed by: Task 7's two client forms

`validateLabel` checks non-empty and nothing else. `truncateRowTitle` then silently cuts the label at 24 UTF-16 units at send time. So `📍 Endereço e como chegar` (25 units) saves cleanly, shows in full in the panel forever, and arrives on every member's phone as `📍 Endereço e como chega`, with nothing anywhere telling her. Task 7 shows her the cut — and it must show the *real* one, computed by the function the sender calls, or the preview drifts from reality and is worse than nothing. A `'use client'` component cannot import it from `whatsapp.ts` without dragging `node:crypto` into the browser bundle, so it moves.

- [ ] **Step 1: Create the module**

`src/lib/list-row-title.ts`:
```ts
/** Client-safe ON PURPOSE. src/lib/whatsapp.ts opens with `import crypto from
 *  'node:crypto'`, so a 'use client' component importing the truncation from
 *  there would pull a Node builtin into the browser bundle.
 *
 *  The panel's preview and the sender MUST compute the cut with the same
 *  function: a preview that drifts from what members actually receive is worse
 *  than no preview, because she would trust it. So the function lives here and
 *  whatsapp.ts re-exports it — one definition, two callers. */

/** WhatsApp interactive-list row titles cap at 24 UTF-16 code units. Counted in
 *  code units, not characters: ⛪ costs 1, 🙏 costs 2. */
export const LIST_ROW_TITLE_MAX = 24;

/** Truncates a row title to at most LIST_ROW_TITLE_MAX UTF-16 code units without
 *  splitting a grapheme cluster (e.g. a surrogate-pair emoji or an emoji +
 *  variation selector). Menu labels in this project routinely start with an
 *  emoji, so a naive `.slice()` can cut a glyph in half and render a broken
 *  character in the chat. */
export function truncateRowTitle(label: string): string {
  if (label.length <= LIST_ROW_TITLE_MAX) return label;

  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
  let result = '';
  for (const { segment } of segmenter.segment(label)) {
    if (result.length + segment.length > LIST_ROW_TITLE_MAX) break;
    result += segment;
  }
  return result;
}
```

`Intl.Segmenter` is available in Safari 14.1+, Chrome 87+ and every Node the repo supports, so it is safe on both sides.

- [ ] **Step 2: Re-export from whatsapp.ts**

In `src/lib/whatsapp.ts`, **delete** the `LIST_ROW_TITLE_MAX` const (line 7) and the whole `truncateRowTitle` function with its doc comment (lines 28–42). In their place, add to the import block at the top of the file — note that both an `import` and an `export … from` are needed, because `export { X } from './y'` does **not** bring `X` into local scope and `buildListPayload` calls it:

```ts
import { truncateRowTitle } from './list-row-title';
```
and immediately after the existing imports:
```ts
/** Re-exported so `@/lib/whatsapp` stays the single import site for the sender
 *  and for tests/whatsapp.test.ts. The definitions moved to a client-safe module
 *  (see its header); this file's public API is unchanged. */
export { LIST_ROW_TITLE_MAX, truncateRowTitle } from './list-row-title';
```

Change nothing else in the file. `buildListPayload`'s call at line 71 keeps working through the local import.

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 0's baseline exactly — no new tests, no new failures. `tests/whatsapp.test.ts` imports both names from `@/lib/whatsapp` at lines 3 and 11 and must still pass untouched; that is the whole point of the re-export. `src/lib/menu-admin-rules.ts` imports `WHATSAPP_LIST_MAX_ROWS` from `./whatsapp` and is unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/lib/list-row-title.ts src/lib/whatsapp.ts
git commit -m "refactor: move row-title truncation to a client-safe module"
```

---

### Task 2: The two behaviour items — copy and rules

**Files:**
- Create: `src/lib/behaviour-items.ts`
- Create: `tests/behaviour-items.test.ts`
- Modify: `src/lib/menu-admin-rules.ts`, `tests/menu-admin-rules.test.ts`

**Interfaces:**
- Consumes: `LIST_ROW_TITLE_MAX` (Task 1), `MenuItemKind` from `@/lib/types`
- Produces: `BehaviourKind`, `BEHAVIOUR_KINDS`, `BEHAVIOUR_ITEM`, `isBehaviourKind`, `missingBehaviourKinds`, `canHideItem`

**The design call this task encodes, and the two alternatives rejected.** A church needs exactly one prayer item and exactly one handoff item; their words come from `church.prayerPromptText` / `church.handoffText`, not from the item. So the answer to "what type is this?" is known in advance for both, and the question does not belong on a form a secretary opens fifty times. Three ways to get them into a church's menu were considered:

- **Seed them at provisioning and backfill live churches.** Rejected. It reaches `provisioning.ts`, `church-defaults.ts` and a new script that must be run by hand against the live church, for a screen-level UI fix — and it gives *every* church two rows it can never delete, including the churches that will never use handoff. Real cost, permanent, on a menu capped at ten.
- **A chooser page at `/novo` that disappears once the church has both.** Rejected. The destination of a familiar button silently changes as the church matures, and nobody is told. It also re-asks the type question, just drawn as cards.
- **Named one-tap buttons on the list page, offered only while the church lacks that kind.** **Chosen.** Zero database migration, zero provisioning change, zero rows forced on anyone. The decision is made by pressing a button whose label names the thing, in the same screen she is already reading, once per church.

- [ ] **Step 1: Create the copy module**

`src/lib/behaviour-items.ts`:
```ts
import { LIST_ROW_TITLE_MAX } from './list-row-title';
import type { MenuItemKind } from './types';

/** The two menu kinds that carry BEHAVIOUR rather than content. Their reply text
 *  lives in church.prayerPromptText / church.handoffText — see menu-router.ts
 *  cases 'prayer' and 'human', which read neither bodyText nor imageUrl. That is
 *  why the panel does not show those two fields for these items, and why this
 *  module carries a sentence explaining what the item does instead. */
export type BehaviourKind = 'prayer' | 'human';

export const BEHAVIOUR_KINDS: readonly BehaviourKind[] = ['prayer', 'human'];

export interface BehaviourItemCopy {
  /** Label the one-tap button creates the item with. Must fit LIST_ROW_TITLE_MAX
   *  — a default the product chooses must never be one the product truncates. */
  defaultLabel: string;
  /** The one-tap button on the list page, shown only while the church has no
   *  item of this kind. */
  addButton: string;
  /** One line under the item's name in the list: what a tap actually does. This
   *  replaces the old cryptic "· oração" / "· atendente" tag. */
  listNote: string;
  /** The edit screen's explanation, standing where the two fields that did
   *  nothing used to be. */
  explanation: string;
  /** Which Configurações field really owns this item's words. The labels match
   *  the ones the Configurações form uses, so the sentence is a findable
   *  instruction rather than a vague pointer. */
  settingsField: string;
}

export const BEHAVIOUR_ITEM: Record<BehaviourKind, BehaviourItemCopy> = {
  prayer: {
    defaultLabel: '🙏 Pedido de oração',
    addButton: '+ Adicionar “🙏 Pedido de oração”',
    listNote: 'Quem tocar aqui é convidado a escrever o pedido, e o pedido chega em Pedidos de Oração.',
    explanation:
      'Esta opção não tem texto próprio. Quando alguém toca nela, a secretária virtual envia o convite ' +
      'para a pessoa escrever o pedido, e o pedido chega em Pedidos de Oração.',
    settingsField: 'Pedir o texto da oração',
  },
  human: {
    defaultLabel: '💬 Falar com atendente',
    addButton: '+ Adicionar “💬 Falar com atendente”',
    // The second half of this sentence is a fact the panel has never told anyone:
    // menu-router.ts returns zero replies while a contact is in 'human' mode, so
    // the bot really does go silent for that person until staff end the handoff.
    listNote:
      'Quem tocar aqui entra na fila da Caixa de Entrada, e a secretária virtual para de responder ' +
      'essa pessoa até vocês encerrarem o atendimento.',
    explanation:
      'Esta opção não tem texto próprio. Quando alguém toca nela, a secretária virtual avisa que a pessoa ' +
      'vai ser atendida, a conversa entra na fila da Caixa de Entrada, e a secretária virtual para de ' +
      'responder essa pessoa até vocês encerrarem o atendimento.',
    settingsField: 'Ao encaminhar para um atendente',
  },
};

export function isBehaviourKind(kind: MenuItemKind): kind is BehaviourKind {
  return kind === 'prayer' || kind === 'human';
}

/** Which behaviour kinds this church does not have yet — the list page offers a
 *  button for each. A church with two prayer items counts as having prayer; this
 *  never proposes a duplicate, and never tries to clean one up either. */
export function missingBehaviourKinds(kinds: MenuItemKind[]): BehaviourKind[] {
  return BEHAVIOUR_KINDS.filter((behaviour) => !kinds.includes(behaviour));
}

/** Exported for the test that keeps the two default labels inside the WhatsApp
 *  row-title cap. Importing LIST_ROW_TITLE_MAX here rather than in the test keeps
 *  the module honest about the constraint it is subject to. */
export const BEHAVIOUR_LABEL_MAX = LIST_ROW_TITLE_MAX;
```

- [ ] **Step 2: Add `canHideItem`**

Append to `src/lib/menu-admin-rules.ts`:
```ts
/** Hiding the LAST visible item leaves the menu with zero rows. buildListPayload
 *  then throws MenuEmptyError, and sendReply's fallback sends the menu's body
 *  text with nothing to tap — a bot not broken enough to notice and not working
 *  enough to use. setItemActive gated activation on the 10-row cap and gated
 *  deactivation on nothing at all, and the old header paragraph on /admin/conteudo
 *  cheerfully taught a one-item church to press exactly that button. */
export function canHideItem(activeCount: number): boolean {
  return activeCount > 1;
}
```

- [ ] **Step 3: Write the tests**

`tests/behaviour-items.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { BEHAVIOUR_ITEM, BEHAVIOUR_KINDS, isBehaviourKind, missingBehaviourKinds } from '@/lib/behaviour-items';
import { LIST_ROW_TITLE_MAX, truncateRowTitle } from '@/lib/list-row-title';

describe('behaviour item defaults', () => {
  it.each([...BEHAVIOUR_KINDS])('%s default label survives the WhatsApp row-title cap', (kind) => {
    const label = BEHAVIOUR_ITEM[kind].defaultLabel;
    // A label the PRODUCT chooses must never be one the product then truncates.
    expect(label.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX);
    expect(truncateRowTitle(label)).toBe(label);
  });

  it.each([...BEHAVIOUR_KINDS])('%s says where the church sees the result', (kind) => {
    // The whole reason these sentences exist: the old UI showed "· oração" and a
    // field that discarded her writing. Every one of these must name a screen.
    expect(BEHAVIOUR_ITEM[kind].listNote.length).toBeGreaterThan(20);
    expect(BEHAVIOUR_ITEM[kind].explanation).toContain('não tem texto próprio');
    expect(BEHAVIOUR_ITEM[kind].settingsField.length).toBeGreaterThan(0);
  });

  it('never says "dízimo"', () => {
    const all = JSON.stringify(BEHAVIOUR_ITEM);
    expect(all.toLowerCase()).not.toContain('dízimo');
    expect(all.toLowerCase()).not.toContain('dizimo');
  });
});

describe('isBehaviourKind', () => {
  it('separates content from behaviour', () => {
    expect(isBehaviourKind('content')).toBe(false);
    expect(isBehaviourKind('prayer')).toBe(true);
    expect(isBehaviourKind('human')).toBe(true);
  });
});

describe('missingBehaviourKinds', () => {
  it('offers both to a freshly provisioned church (Privacidade only)', () => {
    expect(missingBehaviourKinds(['content'])).toEqual(['prayer', 'human']);
  });
  it('offers nothing once the church has both', () => {
    expect(missingBehaviourKinds(['content', 'prayer', 'human'])).toEqual([]);
  });
  it('offers only the missing one', () => {
    expect(missingBehaviourKinds(['content', 'prayer'])).toEqual(['human']);
  });
  it('treats a duplicate as present, never proposing a third', () => {
    expect(missingBehaviourKinds(['prayer', 'prayer', 'human'])).toEqual([]);
  });
  it('offers both to an empty menu', () => {
    expect(missingBehaviourKinds([])).toEqual(['prayer', 'human']);
  });
});
```

Append to `tests/menu-admin-rules.test.ts`:
```ts
describe('canHideItem', () => {
  it('allows hiding while another item is still visible', () => {
    expect(canHideItem(2)).toBe(true);
  });
  it('refuses to hide the last visible item', () => {
    // Zero active rows makes buildListPayload throw MenuEmptyError and the bot
    // answers members with body text and nothing to tap.
    expect(canHideItem(1)).toBe(false);
  });
  it('refuses on an already-empty menu', () => {
    expect(canHideItem(0)).toBe(false);
  });
});
```
and extend the import on line 2 to `import { canActivateAnotherItem, canHideItem, positionsFromOrder } from '@/lib/menu-admin-rules';`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck`
Expected: Task 0's baseline **+ 13** passing tests (8 in `behaviour-items.test.ts` counting the `it.each` expansions of 2 each, 5 in `missingBehaviourKinds`, 3 in `canHideItem` — count what you actually get and record it). Nothing previously passing may fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/behaviour-items.ts src/lib/menu-admin-rules.ts tests/behaviour-items.test.ts tests/menu-admin-rules.test.ts
git commit -m "feat: name what the prayer and handoff items do, and refuse to empty the menu"
```

---

### Task 3: `kind` stops travelling in the request

**Files:**
- Modify: `src/app/admin/(protected)/conteudo/item-actions.ts`

**Interfaces:**
- Consumes: `BEHAVIOUR_ITEM`, `BehaviourKind` (Task 2)
- Produces: `createItem`, `editItem` (same signatures), `addBehaviourItem`; `ItemFormState` gains `notice`. `parseKind` is deleted.

**This is the landmine task.** `parseKind` (`item-actions.ts:20`) returns `'content'` for a missing field, and `editItem` passes its result straight into `updateMenuItem`. Delete the `Tipo` dropdown without doing something about that, and the first time anyone opens a prayer item and presses Salvar it becomes a content item with an empty body: the bot stops asking for prayer requests and starts sending nothing. The fix is not a hidden input — it is to stop reading kind from the request at all. Kind is a property of the row.

- [ ] **Step 1: Replace the whole file**

`src/app/admin/(protected)/conteudo/item-actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';
import {
  countActiveMenuItems,
  createMenuItem,
  getNextPosition,
  listMenuItemsForAdmin,
  updateMenuItem,
} from '@/lib/repo/menu-admin';
import { canActivateAnotherItem } from '@/lib/menu-admin-rules';
import { BEHAVIOUR_ITEM, type BehaviourKind } from '@/lib/behaviour-items';
import { validateLabel, validateMenuItemContent } from '@/lib/validation';

export interface ItemFormState {
  error?: string;
  /** Not an error: something WAS saved, and something about it needs saying. */
  notice?: string;
}

/** The browser uploads the image straight to Vercel Blob and submits only the
 *  resulting URL string in `imageUrl` — no file transits this Server Action. */
function resolveImageUrl(formData: FormData, existing: string | null): string | null {
  const uploaded = String(formData.get('imageUrl') ?? '').trim();
  if (uploaded) return uploaded;
  if (formData.get('removeImage') === 'on') return null;
  return existing;
}

/** There is deliberately NO parseKind here any more, and no `kind` field is read
 *  from any FormData in this file.
 *
 *  Everything this form creates is a content item; the two behaviour kinds are
 *  created by addBehaviourItem below and never change afterwards. Reading a kind
 *  out of a request is exactly what made deleting the "Tipo" dropdown dangerous:
 *  parseKind returns 'content' for a missing field, so a prayer item's form
 *  submission would have silently converted it to a content item with an empty
 *  body — the bot stops asking for prayer requests, and nothing says so. */
export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const label = String(formData.get('label') ?? '').trim();
  const bodyText = String(formData.get('bodyText') ?? '');

  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  const imageUrl = resolveImageUrl(formData, null);

  const contentError = validateMenuItemContent('content', bodyText, imageUrl);
  if (contentError) return { error: contentError };

  // A new item goes live only if the menu is not already at 10 active rows;
  // otherwise it is saved hidden, never silently pushing the WhatsApp list over.
  const active = await countActiveMenuItems(churchId);
  const isActive = canActivateAnotherItem(active);

  const position = await getNextPosition(churchId);
  const created = await createMenuItem({
    churchId, position, label, bodyText, imageUrl, isActive, kind: 'content',
  });

  // The id rides back in the URL so the list can name the item it just saved —
  // and, when the cap demoted it to hidden, say so at the one moment it matters.
  // Until now this redirected with no message at all: she pressed Criar, the
  // product did something other than what she asked, and the only explanation
  // was a paragraph at the top of a page she had already scrolled past. On a
  // phone the new row lands at the bottom of the list, below the fold.
  redirect(`/admin/conteudo?criado=${created.id}`);
}

export async function editItem(id: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const items = await listMenuItemsForAdmin(churchId);
  const current = items.find((i) => i.id === id);
  if (!current) return { error: 'Item não encontrado.' };

  const label = String(formData.get('label') ?? '').trim();
  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  if (current.kind === 'content') {
    const bodyText = String(formData.get('bodyText') ?? '');
    const imageUrl = resolveImageUrl(formData, current.imageUrl);
    const contentError = validateMenuItemContent('content', bodyText, imageUrl);
    if (contentError) return { error: contentError };
    await updateMenuItem(id, churchId, { label, bodyText, imageUrl });
  } else {
    // A behaviour item's reply comes from church.prayerPromptText /
    // handoffText, so its row carries only a name. bodyText and imageUrl are
    // ABSENT from this payload rather than written as '': whatever an older
    // version of this form stored in those columns stays exactly as it is,
    // retrievable with a query even though the panel no longer shows it.
    //
    // `kind` is absent too, and that is the point of the whole task: it comes
    // from the row, never from the request, so no submission can change it.
    await updateMenuItem(id, churchId, { label });
  }

  redirect('/admin/conteudo');
}

/** The two items a church needs exactly one of, created by one tap from the list
 *  instead of by filling a form: their reply text lives in Configurações, so a
 *  form would only ever have collected a name the product already knows.
 *
 *  Idempotent by kind. The button that calls this stops rendering once the church
 *  has an item of that kind, but a button is not a lock — this re-check is what
 *  closes the double-tap and the two-open-tabs races. */
export async function addBehaviourItem(kind: BehaviourKind): Promise<ItemFormState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const items = await listMenuItemsForAdmin(churchId);
  if (items.some((i) => i.kind === kind)) {
    revalidatePath('/admin/conteudo');
    return {};
  }

  const active = await countActiveMenuItems(churchId);
  const isActive = canActivateAnotherItem(active);
  const position = await getNextPosition(churchId);

  await createMenuItem({
    churchId,
    position,
    label: BEHAVIOUR_ITEM[kind].defaultLabel,
    bodyText: '',
    imageUrl: null,
    isActive,
    kind,
  });

  revalidatePath('/admin/conteudo');
  return isActive
    ? {}
    : {
        notice:
          'A opção foi criada, mas ficou fora do menu: o WhatsApp mostra no máximo 10 opções e as 10 já ' +
          'estão ocupadas. Tire uma do menu e depois toque em “Colocar no menu” nesta opção.',
      };
}
```

**Do not add a `kind` hidden input anywhere as a belt-and-braces measure.** A hidden input is still a request field, and a request field is still something a bad submission can carry.

- [ ] **Step 2: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 2's numbers, unchanged. `ItemForm.tsx` still posts a `kind` field at this point — it is simply ignored, which is safe in exactly one direction: an item's kind can no longer change. Nothing else in the repo imported `parseKind` (confirm with `grep -rn "parseKind" src tests`, which must return nothing).

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/conteudo/item-actions.ts"
git commit -m "fix(conteudo): take the item kind from the row, never from the form"
```

---

### Task 4: Refuse to empty the menu

**Files:**
- Modify: `src/app/admin/(protected)/conteudo/actions.ts`

**Interfaces:**
- Consumes: `canHideItem` (Task 2)

`setItemActive` gates activation on the 10-row cap and gates deactivation on nothing. Hide every item and `buildListPayload` throws `MenuEmptyError`; `sendReply` catches it and sends the menu's body text with no options at all. The old header paragraph on this very page taught a one-item church to press that button.

- [ ] **Step 1: Add the guard**

In `src/app/admin/(protected)/conteudo/actions.ts`, change the import on line 11 to:
```ts
import { canActivateAnotherItem, canHideItem } from '@/lib/menu-admin-rules';
```
and replace the whole `setItemActive` function (lines 17–34, including its doc comment) with:
```ts
/** Both directions are gated now. Toggling to active is capped at the 10 rows a
 *  WhatsApp interactive list allows; toggling to hidden is floored at 1, because
 *  zero active rows makes buildListPayload throw MenuEmptyError and the bot then
 *  answers every member with body text and nothing to tap.
 *
 *  The count is safe to compare against the target directly: the list only offers
 *  "Tirar do menu" on rows that are currently active, so on the hide path the
 *  target is always one of the `active` items being counted.
 *
 *  updateMenuItem is church-scoped, so an id from another church is a silent
 *  no-op. */
export async function setItemActive(id: string, isActive: boolean): Promise<ActionResult> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const active = await countActiveMenuItems(churchId);

  if (isActive) {
    if (!canActivateAnotherItem(active)) {
      return {
        error:
          'O menu do WhatsApp mostra no máximo 10 opções, e as 10 já estão ocupadas. ' +
          'Tire outra opção do menu antes de colocar esta.',
      };
    }
  } else if (!canHideItem(active)) {
    return {
      error:
        'Esta é a única opção que está no menu. Se você tirar, quem escrever para a igreja não recebe ' +
        'nenhuma opção para tocar. Coloque outra opção no menu antes de tirar esta.',
    };
  }

  await updateMenuItem(id, churchId, { isActive });
  revalidatePath('/admin/conteudo');
  return {};
}
```

`moveItem` below it is unchanged.

- [ ] **Step 2: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 3's numbers, unchanged.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/conteudo/actions.ts"
git commit -m "fix(conteudo): refuse to hide the last option, which leaves members nothing to tap"
```

---

### Task 5: The menu-row CSS

**Files:**
- Modify: `src/app/globals.css`

> **Reconcile with the mobile plan — read this before writing.**
> These six rules use the **exact names from mobile Task 1's CSS contract** (`.item-card`, `.item-head`, `.item-label`, `.item-meta`, `.item-actions`, `.iconbtn`). Task 6 needs them and mobile Task 1 has not run. **If mobile Task 1 has already landed** (grep `globals.css` for `--tabbar-h`), these rules already exist — verify they satisfy the intent below and **write nothing**. **If it has not**, add them here, and whoever runs mobile Task 1 later must skip these six and add the rest of its list unchanged. Mobile Task 1 already carries "never apply the same CSS twice"; this is that case.

- [ ] **Step 1: Append the rules**

At the end of `src/app/globals.css`:
```css
/* A menu row is a card of two lines: the item's name alone on the first, the
   controls on the second. The name is the only way to know which row you are
   about to take out of the menu, reorder or edit, and measured at a 375px
   viewport it was sharing one line with five controls — 61.6px wide by 92px
   tall, four lines in a narrow ribbon. These class names are mobile-plan Task 1's
   contract; that task must not re-add them. */
.item-card { display: flex; flex-direction: column; gap: 10px; }
.item-head { display: flex; align-items: flex-start; gap: 8px; }
.item-label { flex: 1; min-width: 0; overflow-wrap: break-word; font-weight: 600; }
/* A full sentence, not a tag: on its own line under the name, at hint weight. */
.item-meta { display: block; font-weight: 400; margin-top: 3px; }
/* 10px, not 2px. Each arrow press is an immediate server write that reorders the
   live WhatsApp menu, so a mis-tap between two 44px targets moves the item the
   wrong way — with no undo beyond noticing and pressing the other arrow. */
.item-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.iconbtn { flex: 0 0 auto; }
```

- [ ] **Step 2: Keep the state chip on one line**

The chip text grows from `Oculto` (6 chars) to `Fora do menu` (12) in Task 6. Add `white-space: nowrap` to the existing `.chip` rule so it never wraps to two lines beside the name — `.pill` already does this for the same reason. Change line 88 from:
```css
.chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
```
to:
```css
/* nowrap: the chip states WHERE the option is ("Fora do menu"), which is longer
   than the old "Oculto" and would otherwise break across two lines beside the
   item name at 320px. Same reason .pill has it. */
.chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; white-space: nowrap; }
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 4's numbers, unchanged. `tests/tap-targets.test.ts` reads this file and none of its assertions touch the new rules or the `.chip` rule.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(css): give a menu row two lines, with the item name on the first"
```

---

### Task 6: The list rows say what a tap does

**Files:**
- Modify: `src/app/admin/(protected)/conteudo/MenuList.tsx`, `tests/tap-targets.test.ts`

**Interfaces:**
- Consumes: `BEHAVIOUR_ITEM`, `isBehaviourKind` (Task 2); the six CSS classes (Task 5)

> **SUPERSEDES mobile-plan Task 4 Step 1.** This is a strict superset of it: same classes, same 44×44 arrows ≥8px apart, same disabled-first/disabled-last logic, same item-naming `aria-label`s. Two deltas — `.item-meta` becomes a sentence about what happens when a member taps, and the chip/toggle vocabulary changes. **Do not run mobile Task 4 Step 1 after this task.** Mobile Task 4 Steps 2–4 remain valid (Step 2 is a no-op statement about the header, honoured here; Step 3's manual checks are worth running).

**Two vocabulary calls, both deliberate.** `Ativo | Ativar` and `Oculto | Ocultar` put a state and a verb from the same two-word vocabulary side by side in one row — she reads `Oculto` next to `Ativar` and has to work out which one is describing the world and which one is offering to change it. The chip now states a **location** (`No menu` / `Fora do menu`) and the button states an **action on that location** (`Tirar do menu` / `Colocar no menu`); the two can no longer be misread as each other. The longer strings were the objection to this in one design pass — they cost width — and Task 5's two-line row is what pays for them.

- [ ] **Step 1: Rewrite the component**

`src/app/admin/(protected)/conteudo/MenuList.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { BEHAVIOUR_ITEM, isBehaviourKind } from '@/lib/behaviour-items';
import { moveItem, setItemActive } from './actions';

export interface MenuListItem {
  id: string;
  label: string;
  kind: 'content' | 'prayer' | 'human';
  isActive: boolean;
  hasImage: boolean;
}

export function MenuList({ items }: { items: MenuListItem[] }) {
  const [error, setError] = useState<string>('');
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    setError('');
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {items.map((item, index) => {
        /* A behaviour item's line says what a tap DOES. It replaces "· oração" /
           "· atendente", which named an internal category and told her nothing
           about where the church sees the result. */
        const meta = isBehaviourKind(item.kind)
          ? BEHAVIOUR_ITEM[item.kind].listNote
          : item.hasImage
            ? '📎 com imagem'
            : '';

        return (
          <div key={item.id} className="card item-card">
            {/* Name first and full-width: it is the only way to know which row you
                are about to take out of the menu, reorder or edit. */}
            <div className="item-head">
              <span className="item-label">
                {item.label}
                {meta && <span className="hint item-meta">{meta}</span>}
              </span>
              {/* The chip states WHERE the option is; the button below states what
                  pressing it does. "Oculto" next to "Ativar" was a state and a
                  verb from the same vocabulary sitting adjacent. */}
              <span className={`chip ${item.isActive ? 'on' : 'off'}`}>
                {item.isActive ? 'No menu' : 'Fora do menu'}
              </span>
            </div>
            {/* Every aria-label names the item: these controls sit on their own
                line, away from the label a screen reader would otherwise
                associate with them. */}
            <div className="item-actions">
              <button
                className="iconbtn"
                disabled={pending || index === 0}
                onClick={() => run(() => moveItem(item.id, 'up'))}
                aria-label={`Subir “${item.label}” no menu`}
              >
                ▲
              </button>
              <button
                className="iconbtn"
                disabled={pending || index === items.length - 1}
                onClick={() => run(() => moveItem(item.id, 'down'))}
                aria-label={`Descer “${item.label}” no menu`}
              >
                ▼
              </button>
              <span className="grow" />
              <button
                disabled={pending}
                onClick={() => run(() => setItemActive(item.id, !item.isActive))}
                aria-label={
                  item.isActive ? `Tirar “${item.label}” do menu` : `Colocar “${item.label}” no menu`
                }
              >
                {item.isActive ? 'Tirar do menu' : 'Colocar no menu'}
              </button>
              <Link
                className="btnlink"
                href={`/admin/conteudo/${item.id}`}
                aria-label={`Editar “${item.label}”`}
              >
                Editar
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Retarget the two assertions this breaks**

`tests/tap-targets.test.ts` pins two literal strings that no longer exist. Both must be rewritten **in this commit** or the suite regresses — this is the defect in mobile Task 4 Step 3 recorded in the reconciliation table.

Replace the `keeps the reorder arrows a thumb-width apart` test (lines 60–65) with:
```ts
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
```

Replace the `the rows that were measured over-wide actually opt in` test (lines 118–121) with:
```ts
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
```

Change nothing else in that file. The `.row.wrap` rule and its own test stay — `PrayerList` and `AddBehaviourItems` both use it.

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 5's numbers, **+2** (the retargeted `.item-label` assertions live inside an existing test, so the count may not move — record what you get; what must not happen is a failure).

**Manual check** at 320px on `/admin/conteudo`, with an item named "Horários dos Cultos" that has an image:
- The label reads on one or two full-width lines, never a narrow column.
- `document.querySelector('.card').scrollWidth === document.querySelector('.card').clientWidth`.
- `▲` and `▼` each measure ≥44×44 with ≥8px between them.
- The prayer row's sentence wraps under its name and is legible.
- The chip reads `No menu` on one line.

**And at 1280px:** `document.querySelector('.row > .btnlink.primary').getBoundingClientRect().width` is roughly its own text width, not half the container — this plan adds no `grow` to that link.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(protected)/conteudo/MenuList.tsx" tests/tap-targets.test.ts
git commit -m "feat(conteudo): rows name the item first and say what a tap does"
```

---

### Task 7: The two forms

**Files:**
- Modify: `src/app/admin/(protected)/conteudo/ItemForm.tsx`
- Create: `src/app/admin/(protected)/conteudo/BehaviourItemForm.tsx`
- Modify: `src/app/admin/(protected)/conteudo/novo/page.tsx`, `src/app/admin/(protected)/conteudo/[id]/page.tsx`

**Interfaces:**
- Consumes: `LIST_ROW_TITLE_MAX`, `truncateRowTitle` (Task 1); `BEHAVIOUR_ITEM`, `isBehaviourKind`, `BehaviourKind` (Task 2); `getChurchById` from `@/lib/repo/church-admin`
- Produces: `ItemFormValues` without `kind`; `BehaviourItemForm`

**These four files must land in one commit.** Removing `kind` from `ItemFormValues` breaks both pages' `values={{…}}` props; adding the behaviour branch needs the new form to exist. Split them and the tree does not typecheck in between.

> **Mobile Task 9 stays valid.** `ItemForm.tsx` keeps its identity and keeps the entire image block — including the `IMAGE_ACCEPT_ATTRIBUTE` from shipped commit `d7fd532`, which mobile Task 9's snippet would otherwise revert to `image/*`. Mobile Task 9 Step 2 applies to this file verbatim afterwards.

**The dead fields were not merely irrelevant — they accepted her writing and discarded it.** `validateMenuItemContent` returns `null` immediately for a non-content kind, and `menu-router.ts` `case 'prayer'` / `case 'human'` never read `bodyText` or `imageUrl`. So today a secretary picks "Pedido de oração", writes a warm invitation into the field labelled "Texto da resposta", attaches the church logo, sees the save succeed — and every member receives `prayerPromptText` from Configurações instead. The hint "Deixe em branco para itens de oração ou atendente" is a request, not a guard. The test for a field label is whether you can write it honestly; *"Texto da resposta — este campo não faz nada neste tipo de item"* is not shippable, so the field must not render.

- [ ] **Step 1: `ItemForm.tsx` becomes the content-item form**

`src/app/admin/(protected)/conteudo/ItemForm.tsx`:
```tsx
'use client';

import { useActionState, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { IMAGE_ACCEPT_ATTRIBUTE, validateImageFile } from '@/lib/image-upload';
import { LIST_ROW_TITLE_MAX, truncateRowTitle } from '@/lib/list-row-title';
import type { ItemFormState } from './item-actions';

/** No `kind`. Every item this form creates is a content item, and an existing
 *  item's kind comes from its row in editItem — it is not a form field and there
 *  is no hidden input carrying it. */
export interface ItemFormValues {
  label: string;
  bodyText: string;
  imageUrl: string | null;
}

const initial: ItemFormState = {};

export function ItemForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  values: ItemFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [label, setLabel] = useState<string>(values.label);
  const [imageUrl, setImageUrl] = useState<string>(values.imageUrl ?? '');
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  /* Computed with the SENDER's own function, not a character count. The cap is 24
     UTF-16 code units — ⛪ costs 1, 🙏 costs 2 — so a counter saying "caracteres"
     would be wrong for exactly the labels this product encourages. Showing the
     real cut string needs no explanation and cannot drift from what members get.
     validateLabel checks non-empty only, so until now "📍 Endereço e como chegar"
     saved cleanly, showed in full here forever, and arrived on every member's
     phone as "📍 Endereço e como chega" with nothing anywhere saying so. */
  const cut = label.length > LIST_ROW_TITLE_MAX ? truncateRowTitle(label) : '';

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Checked before the upload starts, so the reason is specific ("this is a
    // HEIC, here is the iPhone setting that fixes it") instead of the generic
    // failure the server's rejection produced. The server allow-list is still the
    // gate — this check is UX and can be bypassed by anyone who cares to.
    const problem = validateImageFile(file);
    if (problem) {
      setUploadError(problem);
      // Cleared so picking the SAME file again still fires onChange — otherwise
      // she re-picks the photo, nothing happens, and the panel looks broken.
      event.target.value = '';
      return;
    }

    setUploadError('');
    setUploading(true);
    try {
      // Straight to Vercel Blob via the session-gated token route — the file never
      // passes through a Server Action, so there is no 1 MB body cap.
      const blob = await upload(file.name, file, { access: 'public', handleUploadUrl: '/api/blob/upload' });
      setImageUrl(blob.url);
      setRemoved(false);
    } catch {
      setUploadError('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="card">
      <label htmlFor="label">Nome que aparece no menu</label>
      <input
        id="label"
        name="label"
        type="text"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        required
      />
      {cut ? (
        <p className="warn">
          No WhatsApp esse nome vai aparecer cortado: “{cut}”. Tire alguns caracteres para ele aparecer inteiro.
        </p>
      ) : (
        <p className="hint">Ex.: Horários dos cultos</p>
      )}

      <label htmlFor="bodyText">Resposta que a pessoa recebe</label>
      <textarea id="bodyText" name="bodyText" defaultValue={values.bodyText} />
      {/* Pre-empts the round-trip error "Um item de conteúdo precisa de um texto
          ou de uma imagem", which she otherwise only meets after submitting. */}
      <p className="hint">Pode ser só texto, só uma imagem, ou os dois.</p>

      <label htmlFor="image">Imagem (opcional — ex.: calendário do mês)</label>
      {/* Not `image/*`: that offer is what makes an iPhone hand over a HEIC the
          WhatsApp API cannot render. Naming the four formats makes iOS's own
          picker convert the photo to JPG before it ever reaches this input. */}
      <input id="image" type="file" accept={IMAGE_ACCEPT_ATTRIBUTE} onChange={onFileChange} disabled={uploading} />
      <p className="hint">Formatos aceitos: JPG, PNG, WEBP ou GIF, até 10 MB.</p>
      {uploading && <p className="hint">Enviando imagem…</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {imageUrl && (
        <p className="hint">
          Imagem anexada ✓{' '}
          {/* The label is the tap target, not the 22px box inside it. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={removed}
              onChange={(e) => { setRemoved(e.target.checked); if (e.target.checked) setImageUrl(''); }}
            /> remover
          </label>
        </p>
      )}
      {/* The Server Action reads only this URL string, not the file itself. */}
      <input type="hidden" name="imageUrl" value={imageUrl} />
      {/* Persists past the checkbox unmounting (imageUrl clears on check) so the
          removal intent still reaches the Server Action on submit. */}
      <input type="hidden" name="removeImage" value={removed ? 'on' : ''} />

      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending || uploading} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : submitLabel}
      </button>
    </form>
  );
}
```

Gone: the `<label htmlFor="kind">` / `<select id="kind" name="kind">` block, and the hint `Deixe em branco para itens de oração ou atendente.` The image block is byte-for-byte what shipped.

- [ ] **Step 2: Create the behaviour form**

`src/app/admin/(protected)/conteudo/BehaviourItemForm.tsx`:
```tsx
'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { LIST_ROW_TITLE_MAX, truncateRowTitle } from '@/lib/list-row-title';
import { BEHAVIOUR_ITEM, type BehaviourKind } from '@/lib/behaviour-items';
import type { ItemFormState } from './item-actions';

const initial: ItemFormState = {};

/** The screen that fixes the silent data loss. A prayer or handoff item has ONE
 *  editable property — the name in the menu. Its reply comes from the church's
 *  prayerPromptText / handoffText, so "Texto da resposta" and the image upload
 *  are absent rather than hinted away: both used to render, both accepted her
 *  writing, and menu-router.ts read neither.
 *
 *  In their place: what the item does, the church's own current reply quoted back
 *  so she can see her words did land somewhere, and the way to that field. */
export function BehaviourItemForm({
  action,
  kind,
  label: initialLabel,
  currentText,
}: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  kind: BehaviourKind;
  label: string;
  currentText: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [label, setLabel] = useState<string>(initialLabel);
  const copy = BEHAVIOUR_ITEM[kind];
  const cut = label.length > LIST_ROW_TITLE_MAX ? truncateRowTitle(label) : '';

  return (
    <form action={formAction} className="card">
      <label htmlFor="label">Nome que aparece no menu</label>
      <input
        id="label"
        name="label"
        type="text"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        required
      />
      {cut ? (
        <p className="warn">
          No WhatsApp esse nome vai aparecer cortado: “{cut}”. Tire alguns caracteres para ele aparecer inteiro.
        </p>
      ) : null}

      <p className="hint" style={{ marginTop: 18, marginBottom: 4 }}>
        O que acontece quando alguém toca nesta opção
      </p>
      <p style={{ margin: '0 0 12px' }}>{copy.explanation}</p>

      <p className="hint" style={{ marginBottom: 4 }}>Hoje a secretária virtual responde assim:</p>
      <p
        style={{
          margin: '0 0 12px',
          padding: 12,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
        }}
      >
        {currentText}
      </p>
      <p className="hint">
        Esse texto fica em Configurações, no campo “{copy.settingsField}”.{' '}
        <Link href="/admin/configuracoes">Editar esse texto</Link>
      </p>

      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: `novo/page.tsx`**

`src/app/admin/(protected)/conteudo/novo/page.tsx`:
```tsx
import { requireReadableSession } from '@/lib/auth/writable';
import { countActiveMenuItems } from '@/lib/repo/menu-admin';
import { canActivateAnotherItem } from '@/lib/menu-admin-rules';
import { ItemForm } from '../ItemForm';
import { createItem } from '../item-actions';

export default async function NovoItemPage() {
  const { churchId } = await requireReadableSession();
  const active = await countActiveMenuItems(churchId);

  return (
    <div>
      <h1>Adicionar ao menu</h1>
      {/* The 10-row cap is stated here, before she types, instead of on arrival at
          the list where it was noise — and instead of only after she submits,
          where createItem used to demote the item to hidden and say nothing. */}
      {!canActivateAnotherItem(active) && (
        <p className="warn">
          O menu já está com 10 opções aparecendo, que é o máximo do WhatsApp. Você pode criar esta agora — ela
          fica fora do menu até você tirar outra.
        </p>
      )}
      <ItemForm
        action={createItem}
        submitLabel="Adicionar ao menu"
        values={{ label: '', bodyText: '', imageUrl: null }}
      />
    </div>
  );
}
```

There is no `Tipo` question on this page and no chooser before it. Every item created here is a content item.

- [ ] **Step 4: `[id]/page.tsx`**

`src/app/admin/(protected)/conteudo/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { getChurchById } from '@/lib/repo/church-admin';
import { isBehaviourKind } from '@/lib/behaviour-items';
import { ItemForm } from '../ItemForm';
import { BehaviourItemForm } from '../BehaviourItemForm';
import { editItem } from '../item-actions';

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { churchId } = await requireReadableSession();
  const items = await listMenuItemsForAdmin(churchId);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();

  const editThisItem = editItem.bind(null, id);

  if (isBehaviourKind(item.kind)) {
    // church_id-scoped, same read the Configurações page does. Quoting the reply
    // she actually sends is what answers "where did my text go" without making
    // her go and look.
    const church = await getChurchById(churchId);
    if (!church) return <p className="error">Igreja não encontrada.</p>;
    const currentText = item.kind === 'prayer' ? church.prayerPromptText : church.handoffText;

    return (
      <div>
        {/* The name is in the heading: on a phone, ten rows in, it is the only way
            to know which item you opened. */}
        <h1>Editar “{item.label}”</h1>
        <BehaviourItemForm
          action={editThisItem}
          kind={item.kind}
          label={item.label}
          currentText={currentText}
        />
      </div>
    );
  }

  return (
    <div>
      <h1>Editar “{item.label}”</h1>
      <ItemForm
        action={editThisItem}
        submitLabel="Salvar"
        values={{ label: item.label, bodyText: item.bodyText, imageUrl: item.imageUrl }}
      />
    </div>
  );
}
```

**Both pages keep `requireReadableSession` — do not remove either line.** `tests/privilege-boundary.test.ts` asserts both the `@/lib/auth/writable` import and the literal identifier for every `page.tsx` under `(protected)`.

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 6's numbers, unchanged. `grep -rn 'name="kind"' src` must return nothing.

**Manual check:**
- `/admin/conteudo/novo`: two fields and an optional image. No dropdown anywhere.
- Type `📍 Endereço e como chegar` into the name: the warning appears and quotes `📍 Endereço e como chega`. Remove a character: it disappears.
- Open a content item: same form, heading names the item, button reads `Salvar`.
- Open the prayer item: one field, the explanation, the church's real `prayerPromptText` quoted, a link to Configurações. **No textarea, no file input.**
- Save the prayer item with a new name, then check the row in the database: `kind` is still `prayer` and `body_text` is byte-for-byte what it was.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(protected)/conteudo/ItemForm.tsx" \
        "src/app/admin/(protected)/conteudo/BehaviourItemForm.tsx" \
        "src/app/admin/(protected)/conteudo/novo/page.tsx" \
        "src/app/admin/(protected)/conteudo/[id]/page.tsx"
git commit -m "feat(conteudo): drop the Tipo question and stop showing fields that discard her writing"
```

---

### Task 8: The list page — the wall of text goes

**Files:**
- Modify: `src/app/admin/(protected)/conteudo/page.tsx`
- Create: `src/app/admin/(protected)/conteudo/AddBehaviourItems.tsx`

**Interfaces:**
- Consumes: `missingBehaviourKinds`, `BEHAVIOUR_ITEM`, `BehaviourKind` (Task 2); `addBehaviourItem` (Task 3); `WHATSAPP_LIST_MAX_ROWS`

`page.tsx:26-29` opens with three facts — reordering, hiding, and the 10-active ceiling — before she has done anything, and on a freshly provisioned church all three are false or harmful: with one item both arrows are `disabled`, and "Ocultar" empties the menu. Each fact now appears at the moment it becomes true. Note that the paragraph was partly **compensating for a missing message**: `createItem` silently demoted item eleven to hidden and redirected without a word. Task 3 gave that event its own message; this task renders it.

- [ ] **Step 1: The one-tap buttons**

`src/app/admin/(protected)/conteudo/AddBehaviourItems.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { BEHAVIOUR_ITEM, type BehaviourKind } from '@/lib/behaviour-items';
import { addBehaviourItem } from './item-actions';

/** Where the "Tipo" dropdown went.
 *
 *  A church needs exactly one prayer item and exactly one handoff item, and their
 *  reply text lives in Configurações — so the answer is known in advance and a
 *  form would only have collected a name the product already has. Written
 *  honestly, each answer names where the church sees the result, and reading
 *  those two sentences makes it obvious a secretary answers this question once in
 *  the church's life. A question answered once is not a form field.
 *
 *  This block renders only while the church lacks a kind, and disappears for good
 *  once it has both. */
export function AddBehaviourItems({ kinds }: { kinds: BehaviourKind[] }) {
  const [result, setResult] = useState<{ error?: string; notice?: string }>({});
  const [pending, startTransition] = useTransition();

  function add(kind: BehaviourKind) {
    setResult({});
    startTransition(async () => {
      setResult(await addBehaviourItem(kind));
    });
  }

  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>Quase toda igreja tem estas opções. Se quiser, adicione com um toque:</p>
      <div className="row wrap">
        {kinds.map((kind) => (
          <button key={kind} disabled={pending} onClick={() => add(kind)}>
            {BEHAVIOUR_ITEM[kind].addButton}
          </button>
        ))}
      </div>
      <p className="hint">A resposta dessas opções você escreve em Configurações, não aqui.</p>
      {result.error && <p className="error">{result.error}</p>}
      {result.notice && <p className="warn">{result.notice}</p>}
    </div>
  );
}
```

- [ ] **Step 2: The list page**

`src/app/admin/(protected)/conteudo/page.tsx`:
```tsx
import Link from 'next/link';
import { requireReadableSession } from '@/lib/auth/writable';
import { countActiveMenuItems, listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { WHATSAPP_LIST_MAX_ROWS } from '@/lib/whatsapp';
import { missingBehaviourKinds } from '@/lib/behaviour-items';
import { MenuList, type MenuListItem } from './MenuList';
import { AddBehaviourItems } from './AddBehaviourItems';

export default async function ConteudoPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string }>;
}) {
  const { criado } = await searchParams;
  const { churchId } = await requireReadableSession();
  const rows = await listMenuItemsForAdmin(churchId);
  const active = await countActiveMenuItems(churchId);

  const items: MenuListItem[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    isActive: r.isActive,
    hasImage: !!r.imageUrl,
  }));

  // Looked up in the church's own rows, so an id from anywhere else simply finds
  // nothing and renders no banner. Nothing here trusts the query string.
  const created = criado ? rows.find((r) => r.id === criado) : undefined;
  const missing = missingBehaviourKinds(rows.map((r) => r.kind));

  return (
    <div>
      <div className="row">
        <h1 className="grow">Menu do WhatsApp</h1>
        {/* No `grow` on this link — see mobile-plan Task 4 Step 2. */}
        <Link className="btnlink primary" href="/admin/conteudo/novo">+ Adicionar ao menu</Link>
      </div>
      <p className="hint">É isto que a pessoa vê quando manda mensagem para a igreja.</p>

      {/* The three sentences that used to live here — reordering, hiding, the
          10-item ceiling — are gone. Each now appears where and when it is true:
          the ceiling on the create form and in the banner below, hiding in the
          refusal from setItemActive, and the arrows are left to speak for
          themselves. */}

      {created &&
        (created.isActive ? (
          <p className="hint" role="status">Pronto! “{created.label}” já está no menu.</p>
        ) : (
          <p className="warn" role="status">
            “{created.label}” foi salvo, mas ficou fora do menu: o WhatsApp mostra no máximo{' '}
            {WHATSAPP_LIST_MAX_ROWS} opções e as {WHATSAPP_LIST_MAX_ROWS} já estão ocupadas. Tire uma do menu e
            depois toque em “Colocar no menu” nesta opção.
          </p>
        ))}

      {active >= WHATSAPP_LIST_MAX_ROWS && (
        <p className="warn">
          O menu está cheio: {WHATSAPP_LIST_MAX_ROWS} de {WHATSAPP_LIST_MAX_ROWS} opções. Para colocar outra,
          tire uma das que estão aparecendo.
        </p>
      )}

      <MenuList items={items} />

      {missing.length > 0 && <AddBehaviourItems kinds={missing} />}
    </div>
  );
}
```

`requireReadableSession` stays — `tests/privilege-boundary.test.ts` requires it.

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 7's numbers, unchanged.

**Manual check:**
- A church with only 🔒 Privacidade: no paragraph about reordering, no counter, no ceiling text. Both add-buttons below the list.
- Tap `+ Adicionar “🙏 Pedido de oração”`: the row appears at the bottom with its sentence, and only the handoff button remains.
- Add items to 10 active, then create an eleventh: the list says it was saved but is out of the menu, and names it.
- On the 10-active list, the full-menu line appears; at 9 it does not.
- Try to take the only visible option out of the menu: the refusal from Task 4 appears above the list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(protected)/conteudo/page.tsx" "src/app/admin/(protected)/conteudo/AddBehaviourItems.tsx"
git commit -m "feat(conteudo): replace the arrival lecture with messages at the moment each rule bites"
```

---

### Task 9: The static contract, and the live-data check

**Files:**
- Create: `tests/conteudo-form.test.ts`

Three of this plan's guarantees are invisible to the type system and would be silently undone by a well-meaning future edit: that no form asks for a kind, that no dead field renders on a behaviour item, and that no client component under `conteudo/` imports `@/lib/whatsapp` (and with it `node:crypto`). This is a static contract over the files' text, in the same style and with the same honest limits as `tests/tap-targets.test.ts`.

- [ ] **Step 1: Write it**

`tests/conteudo-form.test.ts`:
```ts
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

const ITEM_FORM = read('ItemForm.tsx');
const BEHAVIOUR_FORM = read('BehaviourItemForm.tsx');
const ITEM_ACTIONS = read('item-actions.ts');

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

  it('the old "leave it blank" hint is gone from the content form', () => {
    expect(ITEM_FORM).not.toMatch(/Deixe em branco/);
  });
});

describe('client bundle safety', () => {
  it('no client component under conteudo/ imports @/lib/whatsapp', () => {
    // src/lib/whatsapp.ts line 1 is `import crypto from 'node:crypto'`. The row
    // title cap and truncation live in @/lib/list-row-title for this reason.
    const offenders = readdirSync(CONTEUDO)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => {
        const source = read(f);
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
```

- [ ] **Step 2: Verify the whole plan**

Run: `npm test && npm run typecheck && npm run build`
Expected: Task 8's numbers **+ ~10**. Nothing that passed at Task 0 may fail.

Run: `grep -rin "dízimo\|dizimo" src/` — must return nothing.
Run: `grep -rn "parseKind\|name=\"kind\"" src/` — must return nothing.

- [ ] **Step 3: The live-data check — read-only, run before deploying**

Behaviour items' `bodyText` and `imageUrl` are preserved in the database but no longer surfaced anywhere in the panel. Before this ships to the one live church, run this **SELECT** against production and copy anything it returns into the Configurações field that actually owns it:

```sql
SELECT id, church_id, kind, label, image_url, body_text
FROM menu_item
WHERE kind IN ('prayer', 'human')
  AND (COALESCE(body_text, '') <> '' OR image_url IS NOT NULL);
```

Every row this returns is text or an image a secretary wrote or attached that **no member has ever received** — `menu-router.ts` has never read either column for these kinds. Nothing is being destroyed here; it is being made invisible, and she deserves to be handed her own words back rather than have them quietly stop existing on screen. Also run:

```sql
SELECT church_id, kind, count(*) FROM menu_item
WHERE kind IN ('prayer', 'human') GROUP BY 1, 2 HAVING count(*) > 1;
```

Any row here is a church with duplicate behaviour items. They keep working and the panel will not offer to add another, but it also will not tell her — record the result in the task report so support knows.

- [ ] **Step 4: Final manual pass at 375px**

Walk the whole flow on a phone-sized viewport, on a church that has only 🔒 Privacidade:
1. `/admin/conteudo` — heading, one line of orientation, one row, two add-buttons. No paragraph of rules.
2. Tap both add-buttons. Three rows, each behaviour row carrying its sentence. The block disappears.
3. `+ Adicionar ao menu` → two fields → save → the list names what was saved.
4. Edit the prayer item: one field, an explanation, the church's real prompt text, a link.
5. Take two options out of the menu, then try to take the third: refused, with the reason.
6. Reorder with ▲▼ and confirm each is ≥44px with ≥8px between.

- [ ] **Step 5: Commit**

```bash
git add tests/conteudo-form.test.ts
git commit -m "test(conteudo): pin the deleted type question and the client bundle boundary"
```

---

## What gets worse

Every simplification is paid for by someone. These are the bills.

**1. A church can never have two prayer items or two handoff items again.** `menu-router.ts` routes on `selected.kind` and handles any number of them identically, and today's dropdown lets a secretary make as many as she likes. After this, the add-button offers a kind only while the church has none, and the form cannot produce one at all. A church wanting `Pedido de oração` and `Aconselhamento pastoral` as two menu entrances to the same flow gets one. There is no advanced mode. This is the sharpest edge in the design and it is a genuine capability removal, not a hidden one.

**2. `kind` becomes immutable, and the product still cannot delete anything.** There is no `deleteMenuItem` in `src/lib/repo/menu-admin.ts` and no `db.delete(menuItem)` in the tree; commit `4bc83aa` exists specifically to stop the UI promising a deletion the product cannot perform. So a mis-tapped `+ Adicionar “💬 Falar com atendente”` is permanent. She can rename it and take it out of the menu; she cannot remove it or convert it into something useful. On a menu capped at ten rows, a permanently hidden mistake is a small ongoing tax. The old dropdown let her promote a content row called "Oração" into a real prayer item; that path is gone, and the replacement — activate the provisioned one, hide her own — is two steps and a moment of "where did my option go".

**3. Text and images stored on prayer/handoff rows become invisible rather than merely useless.** They were never sent to a member. But a church that pasted its prayer invitation into "Texto da resposta" can no longer see its own words anywhere in the panel. Task 9 Step 3's query is the mitigation and it is a manual one — if nobody runs it, the words are still in the database and nobody knows.

**4. The 10-item ceiling is no longer announced on arrival.** A secretary sketching a fourteen-option menu now meets the wall at item eleven instead of reading about it at item zero. I judge the trade worth making — the paragraph taxed every church, most of which sit at four to six items, to inform the few — but the person it hurts is exactly the ambitious secretary you most want to keep. The create form warns at 10, before she types, which softens it and does not remove it.

**5. Reordering is now explained nowhere.** `page.tsx:27` is today's only mention of `▲▼` anywhere in the product. This plan deletes it and bets the arrows are self-evident. If that bet is wrong, a secretary who wants "Horários" above "Endereço" has no discoverable path and no error to tell her one exists. **This is the single most likely thing in this design to be wrong**, and it is a silence introduced deliberately rather than a gap overlooked — if the owner reports it, restore one line above the rows, shown only at three items or more.

**6. The one live church loses its vocabulary in a single deploy.** `item` → `opção`, `Rótulo` → `Nome que aparece no menu`, `Tipo` → gone, `Ativo`/`Oculto` → `No menu`/`Fora do menu`, `Ocultar`/`Ativar` → `Tirar do menu`/`Colocar no menu`. Every screenshot, support message and WhatsApp instruction the owner has already sent her is now wrong, and there is no in-app changelog to soften it. One church makes this cheap; it does not make it free.

**7. Day one will look like a regression.** The truncation warning fires immediately on every existing label over 24 UTF-16 units — labels that have been silently cut on members' phones for months. The warning is correct and overdue, and she will experience it as "the panel started complaining about things that were fine yesterday". Nothing in the design explains that they were never fine.

**8. A church deliberately silencing its menu loses a legal action.** It can hide nine items and then find it cannot hide the tenth. The refusal names the reason and the way out, but a door that used to be open is now closed.

**9. The blast radius is wider than one screen.** `src/lib/whatsapp.ts` is refactored (behaviour-preserving, re-exported, covered by an existing test), `globals.css` gains rules another plan also intends to add, and `tests/tap-targets.test.ts` has two assertions rewritten — which means the only automated guard on reorder-arrow spacing is being replaced rather than enforced for the length of one commit. A pure UI simplification this is not.

---

## What this plan does NOT build

- **No delete for menu items.** Out of scope, and deliberately not faked. Adding one is a real design question (what happens to a hidden item's history, what a member mid-prayer-flow sees) and belongs in its own plan.
- **No provisioning or backfill change.** New churches still start with exactly one item. The two behaviour items arrive by one tap, on the day the church wants them.
- **No deep links into Configurações.** The link goes to the page, not to the field, until mobile Task 8 gives its `<details>` elements ids. Requested in the reconciliation table above.
- **No character counter, no label length validation.** The truncation warning shows the consequence and never blocks: truncation is not a failure, a long name with a clear first 24 units is a legitimate choice, and rejecting long labels would lock every already-over-length item out of being saved at all.
- **No duplicate-behaviour-item cleanup.** Detected by Task 9 Step 3's query, reported to a human, never fixed automatically.

## Verification reality

There is no browser harness and no jsdom in this repo, and jsdom would not help — it has no layout engine, so nothing here can measure a tap target, an overflow or a rendered warning. The automated gates are `npm test`, `npm run typecheck`, `npm run build`, plus two static contract tests (`tests/tap-targets.test.ts`, `tests/conteudo-form.test.ts`) that read source text and assert the decisions above have not been reversed. Every task also carries an explicit manual check; Task 9 Step 4 collects them. **Neither the database writes nor the WhatsApp send path execute in any test in this plan** — say so plainly in each task report rather than implying coverage that does not exist.
