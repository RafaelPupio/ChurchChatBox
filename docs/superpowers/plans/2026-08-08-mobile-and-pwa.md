# Mobile Panel + PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The panel becomes a phone-first product. A church secretary standing in a hallway can read a member's message, answer it, reorder the menu, post the month's calendar photo and log out — with every control thumb-sized, nothing clipped off-screen at 320px, and the panel installable to her home screen as "Secretária".

**Architecture:** One codebase, responsive. No separate mobile layout, no device sniffing, no second route tree. The existing hand-rolled stylesheet (`src/app/globals.css`, 57 lines) is extended — not replaced — because its failures are concentrated in three missing declarations rather than spread through the markup. Two structural additions: an app bar plus a bottom tab bar for the admin panel (same DOM at every width, repositioned by one media query), and a scrolling conversation thread with a sticky composer. PWA is Next.js's native metadata conventions (`manifest.ts`, generated icons, `viewport` export) plus a deliberately tiny service worker whose only job is an honest offline page.

**Tech Stack:** Next.js 15.5 App Router · React 19 · TypeScript strict · plain CSS in one stylesheet · `next/og` `ImageResponse` for icons (ships with Next; no new dependency) · Vitest

**Scope:** Two parts, sequential. **Part 1 (Tasks 1–11)** makes every screen good on a phone. **Part 2 (Tasks 12–15)** makes it installable and honest offline. Part 1 must land first — see the sequencing note in Global Constraints. Branch this work from `main`.

---

## Global Constraints

- **ALL user-facing text is Brazilian Portuguese.** English only in code comments, identifiers, tests and docs. Every new string in this plan — banners, aria-labels, error messages, the offline page, the manifest — is pt-BR.
- **"dízimo" must never appear anywhere user-facing.** Nothing in this plan adds bot copy, but the constraint stands over every string added here.
- **This plan changes no bot output.** It touches the panel's chrome and layout only. `church.greetingText` and its nine siblings are re-grouped in the UI (Task 9) but their values, names and the `saveTexts` action are untouched.
- **Any new page under `src/app/admin` MUST call `requireReadableSession`, or the suite fails.** `tests/privilege-boundary.test.ts` has a second describe block, `admin read guard`, that walks every `page.tsx` under `src/app/admin/(protected)` and asserts each one both imports `@/lib/auth/writable` and contains the literal identifier `requireReadableSession`. Read that test before starting. **This plan adds no page under `src/app/admin`** — the one new page, `/offline`, lives at `src/app/offline/page.tsx`, deliberately outside the admin tree because it must render with no session, no database and no network. New *components* under `(protected)` (`TabBar.tsx`, `AutoRefresh.tsx`, `ThreadBottom.tsx`) are not `page.tsx` files and are not covered by that test — but they are also not guards, and none of them fetch data.
- **Every church-owned query stays `church_id`-scoped.** Task 3 adds one repository read (`countHandoffContacts`) and it takes `churchId` as its first argument like every other function in `src/lib/repo/inbox.ts`. `src/lib/repo/platform.ts` remains owner-only; nothing in this plan imports it.
- **No CSS framework, no UI kit — and that is a decision, not an omission.** The existing stylesheet already has design tokens (`--bg`, `--card`, `--border`, `--text`, `--muted`, `--primary`, `--primary-contrast`, `--danger`, `--ok`), global `box-sizing: border-box`, and inputs that inherit 16px so iOS never zooms on focus. The whole vocabulary is flat (`.card`, `.row`, `.grow`, `.chip`, `.bubble`, `.thread`, `.conv`, `.btnlink`) with no specificity wars, so a media query appended to the file wins on source order alone. Adopting Tailwind or a component library would mean rewriting the markup of all eleven screens and re-verifying a 212-test suite and a privilege-boundary guard, in exchange for tokens and utilities this file already provides at 57 lines. **The answer is no.** If a future task genuinely needs one, it must argue against that cost first.
- **Never fix overflow with `overflow-x: hidden` on `body` or `html`.** It hides the bug rather than fixing it, and an `overflow` value other than `visible` on an ancestor silently breaks `position: sticky` for every descendant — which this plan relies on for the app bar, the reply composer and the save bar. Fix the flex rule that overflows.
- **No input font-size below 16px, ever.** Below 16px, iOS Safari zooms the page when the field takes focus and never zooms back. The current stylesheet gets this right by accident (inheritance from an unstyled `body`); Task 1 makes it explicit and adds a test.
- **Every interactive control is at least 44×44 CSS px**, with at least 8px between adjacent targets. The `▲`/`▼` reorder pair is the case that matters most: each press is an immediate server write, so a mis-tap silently reorders the live WhatsApp menu the wrong way.
- **Do not set `maximum-scale` or `user-scalable=no`.** Pinch-zoom is how an older volunteer reads a small label. Task 12's `viewport` export sets `initialScale: 1` and nothing else that constrains zoom, and Task 13's test asserts those strings never appear.
- **Sequencing: Part 1 before Part 2, without exception.** `display: standalone` removes the browser URL bar and the browser back button. Installing today's layout — whose `Configurações` link and `Sair` button render 291px off-viewport — would make the panel genuinely inescapable rather than merely frustrating.
- **neon-http has NO TRANSACTIONS.** Nothing here writes, but the constraint stands.
- **TypeScript strict, no `any`.** 212 tests pass today (`npm test` → 19 files, 212 tests). Nothing may regress.
- **Verification reality:** there is no browser harness and no jsdom in this repo, and jsdom would not help — it has no layout engine, so it cannot measure an overflow, a tap target or a wrapped row. Automated gates here are `npm test`, `npm run typecheck`, `npm run build`, plus two new **static contract tests** that read `globals.css` and the PWA files and assert the invariants that the audit found violated. Every task also carries an explicit manual device check with real numbers. Task 15 collects them into one pass.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/globals.css` | **modify** — the whole responsive foundation: tap targets, 16px input floor, wrapping rows, app bar/tab bar, composer, save bar, one `@media (max-width: 640px)` block |
| `tests/mobile-css.test.ts` | **new** — static contract test over `globals.css` |
| `src/app/admin/(protected)/layout.tsx` | **modify** — app bar + tab bar replace the 8-child non-wrapping nav |
| `src/app/admin/(protected)/TabBar.tsx` | **new** — client tab bar, active state via `usePathname`, waiting badge |
| `src/app/admin/(protected)/AutoRefresh.tsx` | **new** — client poller: `router.refresh()` while the tab is visible |
| `src/lib/repo/inbox.ts` | **modify** — `countHandoffContacts`; `listConversations` puts waiting conversations first |
| `tests/inbox-badge.test.ts` | **new** — PGlite test for the count and the ordering |
| `src/app/admin/(protected)/conteudo/MenuList.tsx` | **modify** — label first, 44px controls, 8px apart |
| `src/app/admin/(protected)/conteudo/page.tsx` | **modify** — header row that wraps |
| `src/app/admin/(protected)/oracao/PrayerList.tsx` | **modify** — prayer text is the content, not a ribbon |
| `src/app/admin/(protected)/caixa/page.tsx` | **modify** — conversation rows + auto-refresh |
| `src/app/admin/(protected)/caixa/[contactId]/page.tsx` | **modify** — compact header, back link, scrolling thread |
| `src/app/admin/(protected)/caixa/[contactId]/ThreadBottom.tsx` | **new** — scrolls the thread to the newest message |
| `src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx` | **modify** — sticky composer, Enter sends, `enterKeyHint` |
| `src/app/admin/(protected)/caixa/[contactId]/EndHandoffButton.tsx` | **modify** — short label, full aria-label |
| `src/app/admin/(protected)/configuracoes/TextsForm.tsx` | **modify** — four `<details>` sections, sticky save bar, unsaved-changes guard |
| `src/app/admin/(protected)/conteudo/prepare-image.ts` | **new** — client-side HEIC→JPEG conversion + downscale |
| `src/app/admin/(protected)/conteudo/ItemForm.tsx` | **modify** — thumbnail, real errors, 44px remove control |
| `src/app/admin/login/LoginForm.tsx` | **modify** — responsive wrapper |
| `src/app/owner/login/OwnerLoginForm.tsx` | **modify** — same wrapper |
| `src/app/layout.tsx` | **modify** — `viewport` export, `appleWebApp`, service-worker registration |
| `src/app/icon.svg` | **new** — browser-tab favicon |
| `src/app/icons/art.tsx` | **new** — the shared cross artwork for generated PNGs |
| `src/app/icons/192/route.tsx` | **new** — 192×192 PNG |
| `src/app/icons/512/route.tsx` | **new** — 512×512 PNG |
| `src/app/icons/maskable-512/route.tsx` | **new** — 512×512 maskable PNG (Android) |
| `src/app/apple-icon.tsx` | **new** — 180×180 apple-touch-icon (iOS ignores manifest icons) |
| `src/app/manifest.ts` | **new** — web app manifest |
| `tests/pwa-manifest.test.ts` | **new** — static contract test over the PWA files |
| `src/app/offline/page.tsx` | **new** — offline fallback, inline styles, no DB, no session |
| `public/sw.js` | **new** — service worker: offline fallback only, caches nothing else |
| `src/app/RegisterServiceWorker.tsx` | **new** — client registration |
| `src/lib/hooks/use-online.ts` | **new** — `useOnline()` |
| `src/app/admin/(protected)/ConnectionBanner.tsx` | **new** — pt-BR offline banner |

## Interfaces Reference (canonical — every task matches these exactly)

```ts
// src/lib/repo/inbox.ts  (added)
export function countHandoffContacts(churchId: string): Promise<number>;

// src/app/admin/(protected)/TabBar.tsx
export function TabBar(props: { waiting: number }): JSX.Element;

// src/app/admin/(protected)/AutoRefresh.tsx
export function AutoRefresh(props: { intervalMs?: number }): null;

// src/app/admin/(protected)/caixa/[contactId]/ThreadBottom.tsx
export function ThreadBottom(props: { count: number }): JSX.Element;

// src/app/admin/(protected)/conteudo/prepare-image.ts
export const MAX_UPLOAD_BYTES: number;                       // 10 * 1024 * 1024
export type PreparedImage = { file: File } | { error: string };
export function prepareImage(file: File): Promise<PreparedImage>;

// src/lib/hooks/use-online.ts
export function useOnline(): boolean;

// src/app/admin/(protected)/ConnectionBanner.tsx
export function ConnectionBanner(): JSX.Element | null;

// src/app/RegisterServiceWorker.tsx
export function RegisterServiceWorker(): null;

// src/app/manifest.ts
export default function manifest(): import('next').MetadataRoute.Manifest;

// consumed unchanged from main:
// requireReadableSession(): Promise<{ adminUserId: string; churchId: string; name: string }>  — @/lib/auth/writable
// listConversations(churchId), loadConversation(churchId, contactId)                          — @/lib/repo/inbox
// upload(name, file, opts)                                                                    — @vercel/blob/client
```

**CSS contract added in Task 1** (every later task depends on these names existing):
`--tap` (44px) · `--tabbar-h` (58px) · `.appbar` · `.appbar .brand` · `.appbar .who` · `.tabbar` · `.tabbar a` · `.tab-icon` · `.tab-badge` · `.iconbtn` · `.item-card` · `.item-head` · `.item-label` · `.item-meta` · `.item-actions` · `.prayer-card` · `.prayer-text` · `.conv-name` · `.conv-phone` · `.thread-head` · `.thread-title` · `.thread-sub` · `.back` · `.composer` · `.composer-row` · `.composer-input` · `.composer-send` · `.composer-hint` · `.group` · `.group-summary` · `.savebar` · `.image-preview` · `.login-wrap` · `.login-card` · `.offline-banner` · `.sr-only` · `.chip.pending`

---

# Part 1 — Mobile

### Task 1: Responsive CSS foundation

**Files:**
- Modify: `src/app/globals.css`
- Create: `tests/mobile-css.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the CSS contract listed above

This is the whole foundation. Four of the audit's blockers share one root cause — `.row` has no `flex-wrap` — and flex items refuse to shrink below their min-content width, so a label beside two buttons is crushed into a 62px vertical ribbon instead of moving to its own line. Everything else here is a global declaration, not a per-component sweep.

- [ ] **Step 1: Replace `src/app/globals.css` entirely**

```css
:root {
  --bg: #f6f7f9;
  --card: #ffffff;
  --border: #e3e6ea;
  --text: #1f2933;
  --muted: #6b7280;
  --primary: #075e54;
  --primary-contrast: #ffffff;
  --danger: #b91c1c;
  --ok: #065f46;
  /* Minimum comfortable touch target. Every interactive control honours it. */
  --tap: 44px;
  /* Height of the mobile bottom tab bar, excluding the iOS safe area. .container
     reserves this much bottom padding so content is never hidden behind it. */
  --tabbar-h: 58px;
}
* { box-sizing: border-box; }
/* No overflow-x: hidden on body or html. It would hide a layout bug rather than
   fix it, and any overflow value other than visible on an ancestor silently
   breaks position: sticky for every descendant — which the app bar, the reply
   composer and the save bar all depend on. */
body {
  margin: 0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
}
a { color: var(--primary); }
.container { max-width: 880px; margin: 0 auto; padding: 24px 16px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 12px; }

/* .row is the universal heterogeneous row. It MUST wrap: flex items refuse to
   shrink below min-content, so without this one declaration a label next to two
   buttons is crushed into a vertical ribbon at 375px instead of moving to its
   own line. This single line is the fix for four separate audit blockers. */
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* min-width: 0 lets the growing child shrink below its min-content width, which
   is what allows a long label to wrap or ellipsis instead of forcing overflow. */
.grow { flex: 1; min-width: 0; }

label { display: block; font-size: 14px; color: var(--muted); margin: 10px 0 4px; }

/* Deny-list, not allow-list. The previous rule named text/email/password only,
   so input[type=file] fell through to browser defaults at 13.3px, and any future
   tel/number/date/search input would have inherited ~13.3px and made iOS zoom the
   page on focus. font-size is pinned at 16px because iOS zooms below 16px. */
input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),
textarea, select {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
  font: inherit; font-size: 16px; min-height: var(--tap);
  background: #fff; color: var(--text);
}
textarea { min-height: 90px; resize: vertical; }
input[type=file] {
  width: 100%; font: inherit; font-size: 16px; min-height: var(--tap);
  padding: 9px 12px; border: 1px dashed var(--border); border-radius: 8px;
  background: #fff; color: var(--text);
}
input[type=file]::file-selector-button {
  font: inherit; font-size: 15px; cursor: pointer;
  min-height: 36px; padding: 6px 12px; margin-right: 10px;
  border: 1px solid var(--primary); border-radius: 8px;
  background: var(--primary); color: var(--primary-contrast);
}
input[type=checkbox] { width: 22px; height: 22px; accent-color: var(--primary); }

button { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid var(--border); padding: 10px 16px; min-height: var(--tap); background: #fff; color: var(--text); }
button.primary { background: var(--primary); color: var(--primary-contrast); border-color: var(--primary); }
button.danger { color: var(--danger); border-color: var(--danger); background: #fff; }
button:disabled { opacity: 0.55; cursor: default; }
.btnlink { display: inline-flex; align-items: center; justify-content: center; min-height: var(--tap); text-decoration: none; font: inherit; border-radius: 8px; border: 1px solid var(--border); padding: 10px 16px; background: #fff; color: var(--text); }
.btnlink.primary { background: var(--primary); color: var(--primary-contrast); border-color: var(--primary); }
/* Icon-only controls (the ▲▼ reorder pair). Square, and never closer than 8px to
   a neighbour: the old 42x36 pair sat 2px apart, and each press is an immediate
   server write, so a mis-tap reordered the live menu the wrong way. */
.iconbtn { min-width: var(--tap); min-height: var(--tap); padding: 0; font-size: 16px; line-height: 1; }

/* Still used by the owner console at /owner. flex-wrap keeps it off the right
   edge on a phone; the church panel uses .appbar + .tabbar instead. */
.nav { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: var(--card); border-bottom: 1px solid var(--border); padding: 12px 16px; }
.nav .brand { font-weight: 700; }
.nav a { display: inline-flex; align-items: center; min-height: var(--tap); text-decoration: none; padding: 6px 10px; border-radius: 8px; }
.nav a.active { background: #ecfdf5; color: var(--ok); font-weight: 600; }

/* --- Church panel chrome: app bar (identity + logout) and tab bar (destinations).
       Same DOM at every width. Desktop stacks them as two bars; the media query at
       the bottom pins the tab bar to the bottom of the phone viewport. --- */
.appbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 8px;
  background: var(--card); border-bottom: 1px solid var(--border);
  padding: 8px 12px; padding-top: calc(8px + env(safe-area-inset-top));
}
.appbar .brand { font-weight: 700; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.appbar .who { color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 38%; }
.appbar form { display: flex; }
.tabbar { display: flex; gap: 4px; background: var(--card); border-bottom: 1px solid var(--border); padding: 6px 12px; }
.tabbar a {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-height: var(--tap); padding: 6px 4px; border-radius: 10px;
  text-decoration: none; color: var(--muted); font-size: 12px; line-height: 1.15; text-align: center;
}
.tabbar a[aria-current="page"] { background: #ecfdf5; color: var(--ok); font-weight: 700; }
.tab-icon { position: relative; font-size: 20px; line-height: 1; }
.tab-badge {
  position: absolute; top: -5px; left: 13px;
  min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 999px; background: var(--danger); color: #fff;
  font-size: 12px; font-weight: 700; line-height: 20px; text-align: center;
}

.error { color: var(--danger); font-size: 14px; margin: 8px 0; }
.hint { color: var(--muted); font-size: 13px; }
.warn { color: #92400e; font-size: 13px; }
/* Ativo/Oculto and Bot/Atendimento/Oração are the two most decision-relevant
   labels in the panel; they were the smallest text on it at 11px. */
.chip { font-size: 12px; padding: 3px 9px; border-radius: 999px; font-weight: 600; white-space: nowrap; }
.chip.on { background: #d1fae5; color: var(--ok); }
.chip.off { background: #fee2e2; color: var(--danger); }
.chip.pending { background: #fef3c7; color: #92400e; }
.mode-tag { font-size: 12px; padding: 3px 9px; border-radius: 999px; font-weight: 600; white-space: nowrap; }
.mode-human { background: #fef3c7; color: #92400e; }
.mode-bot { background: #e5e7eb; color: #374151; }
.mode-prayer { background: #ede9fe; color: #5b21b6; }
.pill { font-size: 12px; padding: 3px 9px; border-radius: 999px; font-weight: 600; white-space: nowrap; }
.pill-active { background: #d1fae5; color: #065f46; }
.pill-past_due { background: #fef3c7; color: #92400e; }
.pill-suspended { background: #fee2e2; color: #991b1b; }

/* --- Conteúdo: menu item cards --- */
.item-card { display: flex; flex-direction: column; gap: 8px; }
.item-head { display: flex; align-items: flex-start; gap: 8px; }
.item-label { flex: 1; min-width: 0; font-weight: 600; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
.item-meta { display: block; font-weight: 400; margin-top: 3px; }
.item-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* --- Pedidos de Oração --- */
.prayer-card { display: flex; flex-direction: column; gap: 8px; }
.prayer-text { margin: 0; font-size: 16px; line-height: 1.45; overflow-wrap: anywhere; }
.prayer-meta { margin: 0; }

/* --- Caixa de Entrada --- */
.conv { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 56px; padding: 14px; text-decoration: none; color: var(--text); }
.conv:hover { background: #f2f2f2; }
.conv-name { display: block; font-size: 16px; overflow-wrap: anywhere; }
.conv-phone { display: block; margin-top: 2px; }
.thread-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.thread-title { font-size: 18px; line-height: 1.25; margin: 0; overflow-wrap: anywhere; }
.thread-sub { margin: 2px 0 0; }
.back { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-width: var(--tap); min-height: var(--tap); border: 1px solid var(--border); border-radius: 8px; background: var(--card); text-decoration: none; font-size: 18px; color: var(--text); }
/* The thread scrolls inside itself so the reply box stays within a thumb's reach
   instead of sitting ~1800px below a 30-message history. */
.thread { display: flex; flex-direction: column; gap: 6px; background: #eef2f0; border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin: 12px 0; min-height: 180px; max-height: 60vh; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.bubble { max-width: 78%; padding: 8px 11px; border-radius: 10px; line-height: 1.4; font-size: 15px; white-space: pre-wrap; word-break: break-word; }
.bubble.in { align-self: flex-start; background: #fff; border: 1px solid var(--border); color: var(--text); }
.bubble.out { align-self: flex-end; background: #dcf8c6; color: #111; }
.composer { position: sticky; bottom: 0; z-index: 10; margin-bottom: 0; box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06); }
.composer-row { display: flex; align-items: flex-end; gap: 8px; }
.composer-input { min-height: var(--tap); max-height: 40vh; }
.composer-send { flex: 0 0 auto; min-width: var(--tap); padding: 10px 14px; font-size: 18px; }
.composer-hint { margin: 8px 0 0; }

/* --- Configurações: collapsible groups + sticky save --- */
.group { border: 1px solid var(--border); border-radius: 10px; margin-top: 12px; padding: 0 12px; }
.group[open] { padding-bottom: 12px; }
.group-summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; min-height: var(--tap); padding: 10px 0; font-weight: 600; }
.group-summary::-webkit-details-marker { display: none; }
.group-summary::after { content: '▾'; color: var(--muted); }
.group[open] > .group-summary::after { content: '▴'; }
.savebar { position: sticky; bottom: 0; z-index: 10; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding: 12px 0 0; background: var(--card); border-top: 1px solid var(--border); }

/* --- Conteúdo: image upload --- */
.image-preview { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
.image-preview img { flex: 0 0 auto; width: 72px; height: 72px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }

/* --- Login (both church and owner) --- */
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; min-height: 100dvh; padding: 24px 16px calc(24px + env(safe-area-inset-bottom)); }
.login-card { width: 100%; max-width: 360px; margin: 0; }

.offline-banner { margin: 0 0 12px; padding: 10px 12px; border-radius: 8px; background: #fef3c7; color: #92400e; font-size: 14px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* --- Phones. One block, at the bottom, so it wins on source order. --- */
@media (max-width: 640px) {
  /* Bottom padding clears the fixed tab bar plus the iPhone home indicator. */
  .container { padding: 16px 12px calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px); }
  .card { padding: 14px 12px; }
  h1 { font-size: 24px; line-height: 1.2; margin: 0 0 12px; }
  h2 { font-size: 19px; }
  /* The growing child takes the whole first line; the controls wrap beneath it.
     .conv is excluded on purpose — its mode tag belongs beside the name. */
  .row > .grow { flex-basis: 100%; }
  .bubble { max-width: 88%; }
  .thread { max-height: 52vh; }
  .tabbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    border-bottom: 0; border-top: 1px solid var(--border);
    padding: 4px 6px calc(4px + env(safe-area-inset-bottom));
    box-shadow: 0 -1px 8px rgba(0, 0, 0, 0.07);
  }
  .composer, .savebar { bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); }
}

/* --- Wide screens: menu item cards collapse back to a single row. --- */
@media (min-width: 641px) {
  .item-card { flex-direction: row; align-items: center; }
  .item-head { flex: 1; min-width: 0; align-items: center; }
  .item-actions { flex: 0 0 auto; }
  .prayer-card { flex-direction: row; align-items: center; }
  .prayer-text { flex: 1; min-width: 0; }
}
```

- [ ] **Step 2: Write the contract test**

`tests/mobile-css.test.ts`:
```ts
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

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Body of the first rule whose selector list matches `selector` exactly.
 *  The regex deliberately matches only brace-free rule bodies, which means an
 *  @media prelude never matches as a rule — its inner rules do. */
function block(selector: string, scope: string = CSS): string {
  for (const [, sel, body] of scope.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel.replace(/\s+/g, ' ').trim() === selector) return body;
  }
  throw new Error(`No CSS rule for selector: ${selector}`);
}

/** Text inside `@media <prelude> { ... }`, found by brace counting. */
function media(prelude: string): string {
  const at = CSS.indexOf(`@media ${prelude}`);
  expect(at, `missing @media ${prelude}`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces after @media ${prelude}`);
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

  it('.item-actions keeps 8px between the reorder buttons', () => {
    expect(block('.item-actions')).toMatch(/gap:\s*8px/);
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

  it('does not rubber-band the page when it hits its end', () => {
    expect(block('.thread')).toMatch(/overscroll-behavior:\s*contain/);
  });

  it('the composer sticks to the bottom of the viewport', () => {
    expect(block('.composer')).toMatch(/position:\s*sticky/);
  });
});
```

- [ ] **Step 3: Run the new test**

Run: `npm test -- tests/mobile-css.test.ts`
Expected: all PASS. If `block()` throws "No CSS rule for selector", the selector text in `globals.css` does not match the test byte-for-byte — fix the stylesheet, not the test.

- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: 20 test files, 212 + new tests passing; typecheck exits 0; build succeeds.

**Manual check** (`npm run dev`, devtools device toolbar at 320px, then 375px): the panel will still look wrong — the nav is not fixed until Task 2 — but tap into any `Configurações` field and confirm iOS/Chrome device emulation does not zoom.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css tests/mobile-css.test.ts
git commit -m "feat(ui): responsive CSS foundation — wrapping rows, 44px targets, 16px field floor"
```

---

### Task 2: App bar + bottom tab bar

**Files:**
- Create: `src/app/admin/(protected)/TabBar.tsx`
- Modify: `src/app/admin/(protected)/layout.tsx`

**Interfaces:**
- Consumes: `--tap`, `.appbar`, `.tabbar`, `.tab-icon`, `.tab-badge` from Task 1
- Produces: `TabBar({ waiting })`

Today the nav is eight non-wrapping flex children measuring 666px against a 375px viewport: `Pedidos de Oração` is clipped, and `Configurações`, the admin's name and `Sair` render entirely off-screen with no scrollbar cue that they exist. Splitting identity (app bar) from destinations (tab bar) fixes it with the same DOM at every width — desktop stacks the two bars, the phone pins the tab bar to the bottom where a thumb reaches.

`waiting` is wired in Task 3; pass `0` for now so this task stands alone.

- [ ] **Step 1: Create the tab bar**

`src/app/admin/(protected)/TabBar.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const CAIXA = '/admin/caixa';

/** Short labels, because four tabs must fit 320px: "Configurações" needs ~81px at
 *  12px and only ~69px is available per tab. The full name is on the aria-label
 *  and, more importantly, on the destination page's own <h1>, so the tap always
 *  confirms itself. */
const TABS = [
  { href: '/admin/conteudo', icon: '📋', label: 'Conteúdo', full: 'Conteúdo do menu' },
  { href: CAIXA, icon: '💬', label: 'Caixa', full: 'Caixa de Entrada' },
  { href: '/admin/oracao', icon: '🙏', label: 'Oração', full: 'Pedidos de Oração' },
  { href: '/admin/configuracoes', icon: '⚙️', label: 'Ajustes', full: 'Configurações' },
];

export function TabBar({ waiting }: { waiting: number }) {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      {TABS.map((tab) => {
        // startsWith so /admin/caixa/<id> and /admin/conteudo/novo still highlight
        // their tab — otherwise the only orientation cue disappears mid-task.
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const showBadge = tab.href === CAIXA && waiting > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            aria-label={showBadge ? `${tab.full} — ${waiting} aguardando atendimento` : tab.full}
          >
            <span className="tab-icon" aria-hidden="true">
              {tab.icon}
              {showBadge && <span className="tab-badge">{waiting > 9 ? '9+' : waiting}</span>}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite the layout**

`src/app/admin/(protected)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { getChurchById } from '@/lib/repo/church-admin';
import { effectiveStatus } from '@/lib/church-status';
import { logout } from './actions';
import { TabBar } from './TabBar';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isAuthenticated(session)) {
    redirect('/admin/login');
  }

  const church = session.churchId ? await getChurchById(session.churchId) : undefined;
  const status = church ? effectiveStatus(church.status, church.graceUntil, new Date()) : 'active';

  return (
    <div>
      {/* Identity and logout only. Destinations live in the tab bar below, which on
          a phone is pinned to the bottom of the viewport — the eight-child nav this
          replaces rendered Configurações and Sair 291px past the right edge. */}
      <header className="appbar">
        <span className="brand grow">⛪ Secretária Virtual</span>
        <span className="who">{session.name}</span>
        <form action={logout}>
          <button type="submit">Sair</button>
        </form>
      </header>

      <TabBar waiting={0} />

      <div className="container">
        {status === 'suspended' && (
          <p className="error">
            Assinatura suspensa — o painel está somente leitura e o bot não está respondendo.
            Entre em contato com o suporte para reativar.
          </p>
        )}
        {status === 'past_due' && (
          <p className="warn">
            Pagamento pendente. Regularize para não interromper o atendimento aos membros.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass. In particular `tests/privilege-boundary.test.ts` must still pass — `TabBar.tsx` is not a `page.tsx`, so the `admin read guard` block does not cover it, and the layout's own auth check is unchanged.

**Manual check** at 320px and 375px, on `/admin/conteudo`:
- `document.documentElement.scrollWidth === window.innerWidth` (no horizontal overflow).
- All four tabs visible, each ≥44px tall, none clipped.
- `Sair` visible in the app bar without scrolling.
- Navigate to `/admin/caixa/<id>` — the Caixa tab stays highlighted.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(protected)/TabBar.tsx" "src/app/admin/(protected)/layout.tsx"
git commit -m "feat(ui): app bar + bottom tab bar replace the overflowing admin nav"
```

---

### Task 3: "Waiting for a human" badge on the Caixa tab

**Files:**
- Modify: `src/lib/repo/inbox.ts`, `src/app/admin/(protected)/layout.tsx`
- Create: `tests/inbox-badge.test.ts`

**Interfaces:**
- Consumes: `db`, `contact` schema
- Produces: `countHandoffContacts(churchId)`

Push notifications are explicitly out of scope for this plan. Until they exist, the only way a secretary learns that someone asked for a person is by opening Caixa de Entrada and looking. A count on the tab is the cheapest possible substitute, and it costs one indexed count per page load. The same reasoning applies to ordering: a conversation waiting on a human belongs at the top of the list, not wherever its last message happens to fall.

- [ ] **Step 1: Extend the inbox repository**

In `src/lib/repo/inbox.ts`, replace `listConversations` and append `countHandoffContacts`:
```ts
/** All of the church's contacts. Waiting-on-a-human first, then most-recently-
 *  active.
 *
 *  NULLS LAST is required, not cosmetic: Postgres sorts NULLs FIRST in a DESC
 *  order, so a contact row created without a lastInboundAt would float above
 *  real, recent conversations at the top of the inbox. Verified against a real
 *  Postgres engine. */
export async function listConversations(churchId: string): Promise<ContactRecord[]> {
  return db
    .select()
    .from(contact)
    .where(eq(contact.churchId, churchId))
    .orderBy(sql`(${contact.mode} = 'human') desc, ${contact.lastInboundAt} desc nulls last`);
}

/** How many of this church's conversations are waiting on a person.
 *
 *  Drives the Caixa tab badge. With no push notifications, this badge is the only
 *  thing in the product that tells a secretary someone is waiting — so it is read
 *  on every page load of every screen, deliberately. */
export async function countHandoffContacts(churchId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contact)
    .where(and(eq(contact.churchId, churchId), eq(contact.mode, 'human')));
  return row?.n ?? 0;
}
```
`and`, `eq` and `sql` are already imported at the top of the file; no import changes.

- [ ] **Step 2: Write the test**

`tests/inbox-badge.test.ts`:
```ts
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/** The Caixa badge is the panel's only "someone is waiting" signal, and the
 *  conversation ordering is what a secretary sees first on a 3-inch screen. Both
 *  are single SQL expressions, so both are worth pinning against a real Postgres
 *  engine rather than trusting by inspection. */

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__inboxBadgeClient = client;
  return { db: drizzle(client, { schema }) };
});

import { countHandoffContacts, listConversations } from '@/lib/repo/inbox';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

let client: PGlite;
let churchA = '';
let churchB = '';

async function makeChurch(name: string, phoneNumberId: string): Promise<string> {
  const c = await client.query<{ id: string }>(
    `insert into church (name,phone_number_id,access_token,app_secret,greeting_text,menu_header_text,menu_button_label,
      fallback_text,unsupported_media_text,error_text,prayer_prompt_text,prayer_thanks_text,handoff_text,handoff_closed_text)
     values ($1,$2,'tok','sec','oi','menu','Ver opções','x','y','z','p','q','r','s') returning id`,
    [name, phoneNumberId],
  );
  return c.rows[0].id;
}

async function addContact(churchId: string, phone: string, mode: string, minutesAgo: number | null): Promise<void> {
  await client.query(
    `insert into contact (church_id,phone,name,mode,last_inbound_at)
     values ($1,$2,$3,$4, case when $5::int is null then null else now() - ($5::int * interval '1 minute') end)`,
    [churchId, phone, `Membro ${phone}`, mode, minutesAgo],
  );
}

beforeAll(async () => {
  client = (globalThis as Record<string, unknown>).__inboxBadgeClient as PGlite;

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  churchA = await makeChurch('BadgeIgrejaA', 'PNID_BADGE_A');
  churchB = await makeChurch('BadgeIgrejaB', 'PNID_BADGE_B');

  await addContact(churchA, '5511000001', 'bot', 1);            // newest, but no one waiting
  await addContact(churchA, '5511000002', 'human', 90);         // waiting, older
  await addContact(churchA, '5511000003', 'human', 30);         // waiting, newer
  await addContact(churchA, '5511000004', 'awaiting_prayer', null);
  await addContact(churchB, '5522000001', 'human', 5);          // another church's handoff
});

describe('countHandoffContacts', () => {
  it('counts only conversations in human mode', async () => {
    expect(await countHandoffContacts(churchA)).toBe(2);
  });

  it('never counts another church\'s handoffs', async () => {
    expect(await countHandoffContacts(churchB)).toBe(1);
  });

  it('returns 0, not undefined, for a church with nobody waiting', async () => {
    const empty = await makeChurch('BadgeIgrejaVazia', 'PNID_BADGE_EMPTY');
    expect(await countHandoffContacts(empty)).toBe(0);
  });
});

describe('listConversations ordering', () => {
  it('puts everyone waiting on a human above everyone else', async () => {
    const rows = await listConversations(churchA);
    expect(rows.map((r) => r.phone)).toEqual([
      '5511000003', // human, 30 min ago
      '5511000002', // human, 90 min ago
      '5511000001', // bot, 1 min ago — recent, but nobody is waiting
      '5511000004', // never messaged: NULL last, not first
    ]);
  });

  it('still excludes other churches', async () => {
    const rows = await listConversations(churchB);
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npm test -- tests/inbox-badge.test.ts`
Expected: all PASS. A failure on the ordering test means the `orderBy` expression is wrong — the boolean must come first and `nulls last` must stay on the timestamp.

- [ ] **Step 4: Wire the badge into the layout**

In `src/app/admin/(protected)/layout.tsx`, add the import:
```ts
import { countHandoffContacts } from '@/lib/repo/inbox';
```
after the `status` line, add:
```ts
  const waiting = session.churchId ? await countHandoffContacts(session.churchId) : 0;
```
and change `<TabBar waiting={0} />` to `<TabBar waiting={waiting} />`.

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, including `tests/repo-isolation.test.ts` (its `listConversations` assertion checks a single-row result, which the new ordering does not affect).

- [ ] **Step 6: Commit**

```bash
git add src/lib/repo/inbox.ts tests/inbox-badge.test.ts "src/app/admin/(protected)/layout.tsx"
git commit -m "feat(caixa): badge and sort conversations waiting on a person"
```

---

### Task 4: Conteúdo — readable menu rows

**Files:**
- Modify: `src/app/admin/(protected)/conteudo/MenuList.tsx`, `src/app/admin/(protected)/conteudo/page.tsx`

**Interfaces:**
- Consumes: `.item-card`, `.item-head`, `.item-label`, `.item-meta`, `.item-actions`, `.iconbtn` from Task 1
- Produces: nothing new

At 375px the item name currently measures 61.6px wide by 92px tall — four lines in a 62px ribbon — because the controls claim 281px of a 341px content box and `.grow` collapses to min-content. The name is the only way to know which row you are about to hide, reorder or edit, so it goes first and gets the full width; the controls wrap beneath it.

- [ ] **Step 1: Rewrite the list**

`src/app/admin/(protected)/conteudo/MenuList.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
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
      {items.map((item, index) => (
        <div key={item.id} className="card item-card">
          {/* Name first and full-width: it is the only way to know which row you
              are about to hide, reorder or edit. */}
          <div className="item-head">
            <span className="item-label">
              {item.label}
              {(item.hasImage || item.kind !== 'content') && (
                <span className="hint item-meta">
                  {item.hasImage && '📎 imagem'}
                  {item.hasImage && item.kind !== 'content' && ' · '}
                  {item.kind !== 'content' && (item.kind === 'prayer' ? 'oração' : 'atendente')}
                </span>
              )}
            </span>
            <span className={`chip ${item.isActive ? 'on' : 'off'}`}>{item.isActive ? 'Ativo' : 'Oculto'}</span>
          </div>
          {/* Every aria-label names the item: on a phone the reorder buttons sit on
              their own line, away from the label a screen reader would otherwise
              associate with them. */}
          <div className="item-actions">
            <button
              className="iconbtn"
              disabled={pending || index === 0}
              onClick={() => run(() => moveItem(item.id, 'up'))}
              aria-label={`Mover "${item.label}" para cima`}
            >
              ▲
            </button>
            <button
              className="iconbtn"
              disabled={pending || index === items.length - 1}
              onClick={() => run(() => moveItem(item.id, 'down'))}
              aria-label={`Mover "${item.label}" para baixo`}
            >
              ▼
            </button>
            <span className="grow" />
            <button
              disabled={pending}
              onClick={() => run(() => setItemActive(item.id, !item.isActive))}
              aria-label={`${item.isActive ? 'Ocultar' : 'Ativar'} "${item.label}"`}
            >
              {item.isActive ? 'Ocultar' : 'Ativar'}
            </button>
            <Link className="btnlink" href={`/admin/conteudo/${item.id}`} aria-label={`Editar "${item.label}"`}>
              Editar
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Let the page header wrap**

In `src/app/admin/(protected)/conteudo/page.tsx`, the header is already `<div className="row">` with an `<h1 className="grow">`, so Task 1's `.row { flex-wrap: wrap }` plus `.row > .grow { flex-basis: 100% }` already move the `+ Novo item` button onto its own line at 640px and below. Only one change: make that button full-width on a phone so it is unmissable.

Replace:
```tsx
        <Link className="btnlink primary" href="/admin/conteudo/novo">+ Novo item</Link>
```
with:
```tsx
        <Link className="btnlink primary grow" href="/admin/conteudo/novo">+ Novo item</Link>
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

**Manual check** at 320px on `/admin/conteudo`, with an item named "Horários dos Cultos" that has an image:
- The label reads on one or two full-width lines, never a narrow column.
- `document.querySelector('.card').scrollWidth === document.querySelector('.card').clientWidth` (no 10px spill).
- `▲` and `▼` each measure ≥44×44 with ≥8px between them.
- At ≥641px the card is a single row again.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(protected)/conteudo/MenuList.tsx" "src/app/admin/(protected)/conteudo/page.tsx"
git commit -m "feat(conteudo): menu rows put the item name first and give reorder 44px targets"
```

---

### Task 5: Pedidos de Oração — the request is the content

**Files:**
- Modify: `src/app/admin/(protected)/oracao/PrayerList.tsx`

**Interfaces:**
- Consumes: `.prayer-card`, `.prayer-text`, `.prayer-meta`, `.item-actions` from Task 1

Same `card row` pattern, same failure: a realistic request renders as a ~70px-wide column of ten lines reading one or two words each, next to a 172px button. Prayer requests exist to be read aloud, so the text gets the full width and the control goes below it.

- [ ] **Step 1: Rewrite the list**

`src/app/admin/(protected)/oracao/PrayerList.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { setPrayerStatus } from './actions';

export interface PrayerRow {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  who: string;
  when: string;
}

export function PrayerList({ prayers }: { prayers: PrayerRow[] }) {
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function toggle(id: string, status: 'novo' | 'orado') {
    setError('');
    start(async () => {
      const r = await setPrayerStatus(id, status === 'novo' ? 'orado' : 'novo');
      if (r?.error) setError(r.error);
    });
  }

  if (prayers.length === 0) return <p className="hint">Nenhum pedido ainda.</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {prayers.map((p) => (
        <div key={p.id} className="card prayer-card">
          {/* The request is what this screen is for — it gets the full width, and
              the button that used to take half the row goes underneath it. */}
          <p className="prayer-text">“{p.text}”</p>
          <p className="hint prayer-meta">{p.who} · {p.when}</p>
          <div className="item-actions">
            <span className={`chip ${p.status === 'orado' ? 'on' : 'off'}`}>
              {p.status === 'orado' ? 'Orado ✓' : 'Novo'}
            </span>
            <span className="grow" />
            <button
              disabled={pending}
              onClick={() => toggle(p.id, p.status)}
              aria-label={p.status === 'orado' ? `Marcar o pedido de ${p.who} como novo` : `Marcar o pedido de ${p.who} como orado`}
            >
              {p.status === 'orado' ? 'Marcar como novo' : 'Marcar como orado'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

Note the `@media (min-width: 641px)` rule from Task 1 turns `.prayer-card` back into a single row on desktop, with `.prayer-text` growing — the meta line and the action row sit to its right.

- [ ] **Step 2: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

**Manual check** at 320px on `/admin/oracao` with a two-sentence request: the text reads at full card width in 3–4 lines, the card is under ~150px tall, and the button is ≥44px.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/oracao/PrayerList.tsx"
git commit -m "feat(oracao): prayer text gets the full card width instead of a 70px ribbon"
```

---

### Task 6: Caixa de Entrada — conversation list

**Files:**
- Create: `src/app/admin/(protected)/AutoRefresh.tsx`
- Modify: `src/app/admin/(protected)/caixa/page.tsx`

**Interfaces:**
- Consumes: `.conv`, `.conv-name`, `.conv-phone` from Task 1
- Produces: `AutoRefresh({ intervalMs })`

Nothing pushes an inbound message into an open panel: the webhook writes the row, `revalidatePath` fires only inside the admin's own actions, and there is no `setInterval` and no `revalidate` export anywhere in `src/app/admin/`. A secretary watching the inbox sees nothing until she reloads by hand. `AutoRefresh` is created here and reused by the thread in Task 7.

- [ ] **Step 1: Create the poller**

`src/app/admin/(protected)/AutoRefresh.tsx`:
```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Nothing pushes an inbound WhatsApp message into an open panel: the webhook
 *  writes the row, and no revalidation reaches this browser. Without this, a
 *  member's reply is invisible until the secretary reloads by hand — which turns
 *  a conversation into a page-refresh loop.
 *
 *  router.refresh() re-runs the Server Component and patches the tree in place,
 *  so client state survives: what she has already typed in the reply box is NOT
 *  lost when a refresh lands mid-sentence.
 *
 *  Polling pauses while the tab is hidden, so a panel left open on a desk
 *  overnight does not query Neon every ten seconds until morning. Returning to
 *  the tab, or the network coming back, triggers an immediate catch-up. */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = () => { if (!document.hidden) router.refresh(); };
    const start = () => { if (timer === undefined) timer = setInterval(tick, intervalMs); };
    const stop = () => { if (timer !== undefined) { clearInterval(timer); timer = undefined; } };

    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      router.refresh();
      start();
    };
    const onOnline = () => { router.refresh(); start(); };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', stop);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', stop);
    };
  }, [router, intervalMs]);

  return null;
}
```

- [ ] **Step 2: Rewrite the list page**

`src/app/admin/(protected)/caixa/page.tsx`:
```tsx
import Link from 'next/link';
import { requireReadableSession } from '@/lib/auth/writable';
import { listConversations } from '@/lib/repo/inbox';
import type { ContactMode } from '@/lib/types';
import { AutoRefresh } from '../AutoRefresh';

function modeTag(mode: ContactMode): { label: string; cls: string } {
  if (mode === 'human') return { label: 'Atendimento', cls: 'mode-human' };
  if (mode === 'awaiting_prayer') return { label: 'Oração', cls: 'mode-prayer' };
  return { label: 'Bot', cls: 'mode-bot' };
}

export default async function CaixaPage() {
  const { churchId } = await requireReadableSession();
  const conversations = await listConversations(churchId);

  return (
    <div>
      <h1>Caixa de Entrada</h1>
      <p className="hint">
        Quem pediu para falar com uma pessoa aparece no topo, marcado como <strong>Atendimento</strong>.
        Abra para responder pelo número da igreja. A lista se atualiza sozinha.
      </p>
      <AutoRefresh />
      {conversations.length === 0 ? (
        <p className="hint">Nenhuma conversa ainda.</p>
      ) : (
        conversations.map((c) => {
          const tag = modeTag(c.mode);
          return (
            <Link key={c.id} className="card conv" href={`/admin/caixa/${c.id}`}>
              <span className="grow">
                <strong className="conv-name">{c.name || c.phone}</strong>
                {c.name && <span className="hint conv-phone">{c.phone}</span>}
              </span>
              <span className={`mode-tag ${tag.cls}`}>{tag.label}</span>
            </Link>
          );
        })
      )}
    </div>
  );
}
```

`requireReadableSession` is retained — `tests/privilege-boundary.test.ts` requires it on every `page.tsx` under `(protected)`, and this page renders member phone numbers.

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, including the `admin read guard` block.

**Manual check** at 320px: each conversation card is ≥56px tall, the name wraps within its own column and the mode tag stays on the same line at the right. Open devtools Network, wait 20s and confirm two refresh requests; switch to another tab for 30s and confirm none fire while hidden.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(protected)/AutoRefresh.tsx" "src/app/admin/(protected)/caixa/page.tsx"
git commit -m "feat(caixa): readable conversation rows and a self-refreshing list"
```

---

### Task 7: Caixa de Entrada — the thread (the most important screen)

**Files:**
- Create: `src/app/admin/(protected)/caixa/[contactId]/ThreadBottom.tsx`
- Modify: `src/app/admin/(protected)/caixa/[contactId]/page.tsx`, `ReplyForm.tsx`, `EndHandoffButton.tsx`

**Interfaces:**
- Consumes: `.thread`, `.thread-head`, `.thread-title`, `.back`, `.composer*`, `.sr-only` from Task 1; `AutoRefresh` from Task 6
- Produces: `ThreadBottom({ count })`

This is the time-critical screen and the worst one today. `.thread` has `max-height: none` and `overflow-y: visible`, so it grows without bound; the reply box lives below the whole history, which puts it roughly 1800px down a 30-message thread; there is no scroll-to-newest anywhere in `src/app/admin/`; and the header alone burns ~180px of an 812px screen on a three-line name beside a two-line button. Four fixes: the thread scrolls inside itself, the composer sticks to the bottom of the viewport, the newest message is what you land on, and Enter sends.

- [ ] **Step 1: Create the scroll anchor**

`src/app/admin/(protected)/caixa/[contactId]/ThreadBottom.tsx`:
```tsx
'use client';

import { useEffect, useRef } from 'react';

/** Puts the newest message on screen. The thread is a scroll container and the
 *  reply box sits below it, so without this every single visit starts at the
 *  oldest message and needs a full thumb-scroll to reach anything current.
 *
 *  Assigning scrollTop directly (rather than scrollIntoView) confines the jump to
 *  the thread element — scrollIntoView would also scroll the page and push the
 *  app bar away. Re-runs when the message count changes, so an AutoRefresh that
 *  brings in a new message lands at the bottom too. */
export function ThreadBottom({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = ref.current?.closest('.thread');
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [count]);

  return <div ref={ref} aria-hidden="true" />;
}
```

- [ ] **Step 2: Rewrite the thread page**

`src/app/admin/(protected)/caixa/[contactId]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { loadConversation } from '@/lib/repo/inbox';
import { isReplyWindowOpen, hoursRemaining } from '@/lib/reply-window';
import { AutoRefresh } from '../../AutoRefresh';
import { ReplyForm } from './ReplyForm';
import { EndHandoffButton } from './EndHandoffButton';
import { ThreadBottom } from './ThreadBottom';

export default async function ConversationPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const { churchId } = await requireReadableSession();

  const convo = await loadConversation(churchId, contactId);
  if (!convo) notFound();

  const now = new Date();
  const open = isReplyWindowOpen(convo.contact.lastInboundAt, now);
  const hrs = hoursRemaining(convo.contact.lastInboundAt, now);

  return (
    <div>
      {/* Deliberately compact: the old header spent ~180px of an 812px phone
          screen on a wrapped name beside a two-line button, before a single
          message was visible. */}
      <div className="thread-head">
        <Link className="back" href="/admin/caixa" aria-label="Voltar para a Caixa de Entrada">←</Link>
        <div className="grow">
          <h1 className="thread-title">{convo.contact.name || convo.contact.phone}</h1>
          {convo.contact.name && <p className="hint thread-sub">{convo.contact.phone}</p>}
        </div>
        {convo.contact.mode === 'human' && <EndHandoffButton contactId={contactId} />}
      </div>

      <AutoRefresh />

      <div className="thread">
        {convo.messages.length === 0 && <span className="hint">Sem mensagens.</span>}
        {convo.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>
            {m.body ?? (m.direction === 'inbound' ? '📎 mídia recebida' : '')}
          </div>
        ))}
        <ThreadBottom count={convo.messages.length} />
      </div>

      {/* Reply only for an active handoff: a reply to a bot-mode contact would send,
          but the bot would still answer their next message — an interleaved thread.
          Mirror the EndHandoffButton's mode === 'human' gate. */}
      {convo.contact.mode !== 'human' ? (
        <p className="hint">Esta conversa não está em atendimento humano — o bot responde automaticamente. Para responder por aqui, a pessoa precisa pedir um atendente.</p>
      ) : open ? (
        <ReplyForm contactId={contactId} hoursRemaining={hrs} />
      ) : (
        <p className="error">A janela de 24 horas do WhatsApp expirou. Só é possível responder até 24h após a última mensagem da pessoa.</p>
      )}
    </div>
  );
}
```

Note `.thread-head` is a plain flex row, not sticky. A second sticky element at `top: 0` would slide underneath the app bar (`z-index: 20`) and disappear; since the thread now scrolls inside itself, the page barely scrolls at all and the header stays in view anyway.

- [ ] **Step 3: Rewrite the reply form as a composer**

`src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx`:
```tsx
'use client';

import { useActionState, useRef } from 'react';
import { sendReplyToContact, type ReplyState } from '../actions';

const initial: ReplyState = {};

export function ReplyForm({ contactId, hoursRemaining }: { contactId: string; hoursRemaining: number }) {
  const action = sendReplyToContact.bind(null, contactId);
  const [state, formAction, pending] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="card composer">
      {state.error && <p className="error">{state.error}</p>}
      <label htmlFor="body" className="sr-only">Responder</label>
      <div className="composer-row">
        <textarea
          id="body"
          name="body"
          className="composer-input"
          rows={2}
          required
          placeholder="Escreva sua resposta…"
          /* enterKeyHint turns the phone keyboard's return key into "enviar"; the
             onKeyDown below is what makes it actually send, since a textarea would
             otherwise just insert a newline. Same behaviour as WhatsApp Web. */
          enterKeyHint="send"
          autoComplete="off"
          onKeyDown={(event) => {
            // isComposing guards IME input: on an Android keyboard mid-suggestion,
            // Enter commits the word and must not send a half-typed message.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              // requestSubmit, not submit(): submit() skips both the required
              // validation and the React action.
              formRef.current?.requestSubmit();
            }
          }}
        />
        <button className="primary composer-send" type="submit" disabled={pending} aria-label="Enviar resposta">
          {pending ? '…' : '➤'}
        </button>
      </div>
      <p className="hint composer-hint">
        ⏱️ Janela de resposta: ~{hoursRemaining}h restantes · Enter envia, Shift+Enter quebra a linha
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Shorten the end-handoff button**

In `src/app/admin/(protected)/caixa/[contactId]/EndHandoffButton.tsx`, the wrapper and the label are the only changes. Replace the returned JSX with:
```tsx
  return (
    <span className="row" style={{ gap: 8, flex: '0 0 auto' }}>
      {error && <span className="error">{error}</span>}
      <button
        type="button"
        disabled={pending}
        aria-label="Encerrar o atendimento humano desta conversa"
        onClick={() => {
          if (!confirm('Encerrar o atendimento? O bot volta a responder esta pessoa.')) return;
          setError('');
          // Async transition callback so `pending` tracks the real server round-trip,
          // and the promise is awaited (not fire-and-forget) so failures surface.
          start(async () => {
            try {
              // The action reports refusals by RETURNING an error (suspended or
              // revoked); only genuine faults throw. Check both.
              const result = await endHandoff(contactId);
              if (result?.error) setError(result.error);
            } catch {
              setError('Não foi possível encerrar. Tente novamente.');
            }
          });
        }}
      >
        {/* "✅ Encerrar atendimento" wrapped to two lines and made the header 62px
            tall on a phone. The full sentence lives on the aria-label. */}
        {pending ? 'Encerrando…' : 'Encerrar'}
      </button>
    </span>
  );
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

**Manual check** at 375px on a thread with 30 messages:
- The page lands with the newest bubble visible, without touching the screen.
- The reply box is on screen at load; `document.querySelector('.composer').getBoundingClientRect().bottom <= window.innerHeight`.
- Scrolling the thread does not scroll the page past its end (`overscroll-behavior: contain`).
- Typing and pressing the keyboard's "enviar" sends; Shift+Enter inserts a newline.
- The header (back link + name + Encerrar) is under ~80px tall.
- With the thread open, wait 15s while a message is inserted server-side: it appears and the view scrolls to it, and text already typed in the box is still there.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(protected)/caixa/[contactId]"
git commit -m "feat(caixa): scrolling thread, sticky composer, scroll-to-newest, Enter sends"
```

---

### Task 8: Configurações — grouped fields, sticky save, unsaved-changes guard

**Files:**
- Modify: `src/app/admin/(protected)/configuracoes/TextsForm.tsx`

**Interfaces:**
- Consumes: `.group`, `.group-summary`, `.savebar`, `.chip.pending` from Task 1

One 1458px form — about 1.8 phone screens — of ten visually identical 90px boxes, with the save button 1405px in and nothing on screen saying there are unsaved changes. An accidental iOS back-swipe discards the lot silently.

`<details>` is the right tool: it needs no JavaScript, it is keyboard- and screen-reader-native, and — this is the load-bearing detail — **a collapsed `<details>` keeps its inputs in the DOM, so every field is still submitted regardless of which sections are open.** Conditional rendering would not be safe here; collapsing is.

- [ ] **Step 1: Rewrite the form**

`src/app/admin/(protected)/configuracoes/TextsForm.tsx`:
```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveTexts, type ConfigResult } from './actions';

const initial: ConfigResult = {};

interface Field { name: string; label: string; }
interface Group { id: string; title: string; fields: Field[]; }

/** Same ten fields, same names, same action — grouped by when the member sees
 *  them, so a correction to the saudação does not mean scrolling past seven
 *  unrelated boxes. */
const GROUPS: Group[] = [
  {
    id: 'boas-vindas',
    title: 'Boas-vindas e menu',
    fields: [
      { name: 'greetingText', label: 'Saudação (primeiro contato)' },
      { name: 'menuHeaderText', label: 'Cabeçalho do menu' },
      { name: 'menuButtonLabel', label: 'Rótulo do botão do menu (ex.: Ver opções)' },
    ],
  },
  {
    id: 'nao-entendeu',
    title: 'Quando o bot não entende',
    fields: [
      { name: 'fallbackText', label: 'Mensagem quando não entende' },
      { name: 'unsupportedMediaText', label: 'Mensagem para áudio/figurinha/foto' },
      { name: 'errorText', label: 'Mensagem de instabilidade' },
    ],
  },
  {
    id: 'oracao',
    title: 'Pedidos de oração',
    fields: [
      { name: 'prayerPromptText', label: 'Pedir o texto da oração' },
      { name: 'prayerThanksText', label: 'Agradecimento do pedido de oração' },
    ],
  },
  {
    id: 'atendimento',
    title: 'Atendimento humano',
    fields: [
      { name: 'handoffText', label: 'Ao encaminhar para um atendente' },
      { name: 'handoffClosedText', label: 'Ao encerrar o atendimento' },
    ],
  },
];

export function TextsForm({ values }: { values: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(saveTexts, initial);
  const [dirty, setDirty] = useState<string[]>([]);

  // A successful save clears the unsaved-changes state, and the browser warning
  // goes with it.
  useEffect(() => { if (state.ok) setDirty([]); }, [state.ok]);

  // The browser's own "leave site?" prompt. It is the only thing that survives an
  // accidental iOS back-swipe, and it must NOT be armed when nothing is dirty.
  useEffect(() => {
    if (dirty.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.length]);

  function markDirty(groupId: string) {
    setDirty((current) => (current.includes(groupId) ? current : [...current, groupId]));
  }

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Textos do bot</h2>
      <p className="hint">Tudo o que a secretária virtual diz. Abra uma seção, edite e salve — muda na hora.</p>

      <div onInput={() => markDirty('igreja')}>
        <label htmlFor="name">Nome da igreja</label>
        <input id="name" name="name" type="text" defaultValue={values.name ?? ''} />
      </div>

      {/* A collapsed <details> keeps its inputs in the DOM, so every field is
          submitted whether or not its section is open. Conditional rendering here
          would silently blank the closed sections. */}
      {GROUPS.map((group, index) => (
        <details key={group.id} className="group" open={index === 0} onInput={() => markDirty(group.id)}>
          <summary className="group-summary">
            <span className="grow">{group.title}</span>
            {dirty.includes(group.id) && <span className="chip pending">alterado</span>}
          </summary>
          {group.fields.map((field) => (
            <div key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <textarea id={field.name} name={field.name} defaultValue={values[field.name] ?? ''} />
            </div>
          ))}
        </details>
      ))}

      {state.error && <p className="error">{state.error}</p>}

      <div className="savebar">
        <span className="grow hint" role="status">
          {dirty.length > 0
            ? '● Alterações não salvas'
            : state.ok
              ? 'Salvo! ✓'
              : 'Nenhuma alteração'}
        </span>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar textos'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

**Manual check** at 375px on `/admin/configuracoes`:
- The form is under ~700px tall with only the first section open.
- `Salvar textos` is visible without scrolling, sitting above the tab bar.
- Editing a field in a collapsed-then-opened section shows `alterado` on its summary and `● Alterações não salvas` in the save bar.
- **Critically:** collapse every section, change only the church name, save, reload — all ten texts still hold their previous values (nothing was blanked).
- With unsaved changes, attempt to navigate away and confirm the browser prompts.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/configuracoes/TextsForm.tsx"
git commit -m "feat(config): group bot texts into sections with a sticky save and dirty guard"
```

---

### Task 9: Conteúdo — the image upload a secretary can actually use

**Files:**
- Create: `src/app/admin/(protected)/conteudo/prepare-image.ts`
- Modify: `src/app/admin/(protected)/conteudo/ItemForm.tsx`

**Interfaces:**
- Consumes: `.image-preview` from Task 1; `upload` from `@vercel/blob/client`
- Produces: `MAX_UPLOAD_BYTES`, `PreparedImage`, `prepareImage(file)`

This is the flow for posting the month's calendar, so it is routine. Today the route accepts `png/jpeg/webp/gif` only — HEIC, the iPhone camera default, is rejected — and every failure collapses into "Não foi possível enviar a imagem. Tente novamente.", which instructs her to do the exact thing that will fail again, forever.

**The obvious fix is wrong.** Adding `image/heic` to `allowedContentTypes` would let the upload succeed and then fail silently downstream: the WhatsApp Cloud API does not accept HEIC, so the church's calendar would be stored and never delivered. Convert instead. Safari decodes HEIC natively, so `createImageBitmap` reads the file and the canvas re-encodes it as JPEG — which also downscales a 4–8 MB camera photo to a few hundred KB, fixing the 10 MB cap and the "looks frozen on church wifi" problem in the same pass. **`src/app/api/blob/upload/route.ts` is deliberately left unchanged.**

- [ ] **Step 1: Create the converter**

`src/app/admin/(protected)/conteudo/prepare-image.ts`:
```ts
/** Browser-only: turns whatever the phone's photo picker hands over into a
 *  WhatsApp-safe JPEG before it is uploaded.
 *
 *  Why convert rather than widen the accepted content types: HEIC is the iPhone
 *  camera default, and the WhatsApp Cloud API does NOT accept HEIC. Allowing it
 *  through would trade a visible upload error for an invisible delivery failure —
 *  the church's calendar stored, and never sent to a single member. Safari decodes
 *  HEIC natively, so the browser can do the conversion the API cannot.
 *
 *  Downscaling to 1600px is the same fix twice: it keeps a 12 MP camera photo well
 *  under the 10 MB blob cap, and turns a multi-minute upload on church wifi into a
 *  couple of seconds. */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export type PreparedImage = { file: File } | { error: string };

function looksLikeHeic(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    // imageOrientation: 'from-image' applies the EXIF rotation, so a photo taken
    // sideways does not arrive sideways on every member's phone.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return {
      error: looksLikeHeic(file)
        ? 'Este aparelho salvou a foto no formato HEIC e não foi possível convertê-la aqui. No iPhone: Ajustes › Câmera › Formatos › “Mais Compatível”, tire a foto de novo e envie. Outra saída rápida: abra a foto, tire um print e envie o print.'
        : 'Não foi possível ler este arquivo como imagem. Envie uma foto em JPG ou PNG.',
    };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return { error: 'Não foi possível preparar a imagem neste navegador. Tente por outro aparelho.' };
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) return { error: 'Não foi possível preparar a imagem. Tente outra foto.' };
  if (blob.size > MAX_UPLOAD_BYTES) {
    return { error: 'A imagem continua grande demais mesmo depois de reduzida. Tente uma foto menor.' };
  }

  return { file: new File([blob], 'imagem.jpg', { type: 'image/jpeg' }) };
}
```

- [ ] **Step 2: Rewrite the upload section of the form**

In `src/app/admin/(protected)/conteudo/ItemForm.tsx`, add the import:
```ts
import { prepareImage } from './prepare-image';
```
replace the state block and `onFileChange`:
```tsx
  const [state, formAction, pending] = useActionState(action, initial);
  const [imageUrl, setImageUrl] = useState<string>(values.imageUrl ?? '');
  const [preview, setPreview] = useState<string>(values.imageUrl ?? '');
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    // Captured synchronously: currentTarget is null by the time the awaits below
    // resolve, and we need the element again to clear its value.
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setUploadError('');
    setUploading(true);
    let localPreview = '';
    try {
      const prepared = await prepareImage(file);
      if ('error' in prepared) {
        setUploadError(prepared.error);
        return;
      }
      // Show the thumbnail before the upload finishes: on a camera roll of
      // thousands, confirming she picked the right photo is the whole point.
      localPreview = URL.createObjectURL(prepared.file);
      setPreview(localPreview);

      // Straight to Vercel Blob via the session-gated token route — the file never
      // passes through a Server Action, so there is no 1 MB body cap.
      const blob = await upload(prepared.file.name, prepared.file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
      });
      setImageUrl(blob.url);
      setPreview(blob.url);
      setRemoved(false);
    } catch {
      setUploadError('O envio não completou. Verifique a conexão e tente de novo — se continuar, fale com o suporte.');
      setPreview(imageUrl);
    } finally {
      if (localPreview) URL.revokeObjectURL(localPreview);
      setUploading(false);
      // Cleared so re-picking the SAME photo after an error still fires onChange.
      input.value = '';
    }
  }
```
and replace the file-input block (from `<label htmlFor="image">` through the closing `)}` of the old `imageUrl &&` paragraph) with:
```tsx
      <label htmlFor="image">Imagem (opcional — ex.: calendário do mês)</label>
      <input id="image" type="file" accept="image/*" onChange={onFileChange} disabled={uploading} />
      <p className="hint">A foto é reduzida automaticamente antes de subir. Fotos de iPhone funcionam.</p>
      {uploading && <p className="hint">⏳ Enviando imagem… não feche esta tela.</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {preview && (
        <div className="image-preview">
          <img src={preview} alt="Prévia da imagem deste item" />
          <span className="grow hint">{uploading ? 'Enviando…' : 'Imagem anexada ✓'}</span>
          <button
            type="button"
            className="danger"
            disabled={uploading}
            onClick={() => { setRemoved(true); setImageUrl(''); setPreview(''); }}
          >
            Remover
          </button>
        </div>
      )}
```
The two hidden inputs (`imageUrl`, `removeImage`) and their comments stay exactly as they are — the 13×13px `remover` checkbox they used to sit beside is what the `Remover` button replaces.

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

**Manual check** on a real iPhone (this one cannot be faked in device emulation, because emulation has no HEIC files):
- Pick a photo straight from the camera roll — it uploads and a 72px thumbnail appears.
- The uploaded blob URL ends in `.jpg` and the stored file is a few hundred KB, not several MB.
- A sideways-shot photo appears upright in the thumbnail.
- The file input itself is ≥44px tall with a legible 16px label.
- `Remover` is ≥44px and clears the thumbnail; saving then really removes the image.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(protected)/conteudo/prepare-image.ts" "src/app/admin/(protected)/conteudo/ItemForm.tsx"
git commit -m "feat(conteudo): convert iPhone HEIC photos to JPEG, preview them, and say what went wrong"
```

---

### Task 10: Login screens

**Files:**
- Modify: `src/app/admin/login/LoginForm.tsx`, `src/app/owner/login/OwnerLoginForm.tsx`

**Interfaces:**
- Consumes: `.login-wrap`, `.login-card` from Task 1

Both login cards are inline-styled `maxWidth: 360, margin: '80px auto'` and sit outside `.container`, so they have no horizontal padding of their own: 7.5px gutters at 375px, and an overflowing viewport at 320px. This is the first screen anyone sees.

- [ ] **Step 1: Church login**

`src/app/admin/login/LoginForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    // The wrapper supplies the gutters the card used to lack: it sits outside
    // .container, so at 320px the old inline maxWidth overflowed the viewport.
    <div className="login-wrap">
      <form action={formAction} className="card login-card">
        <h1 style={{ marginTop: 0 }}>Entrar</h1>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {state.error && <p className="error">{state.error}</p>}
        <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Owner login**

`src/app/owner/login/OwnerLoginForm.tsx` — same wrapper, unchanged heading and fields:
```tsx
'use client';

import { useActionState } from 'react';
import { ownerLogin, type OwnerLoginState } from './actions';

const initial: OwnerLoginState = {};

export function OwnerLoginForm() {
  const [state, formAction, pending] = useActionState(ownerLogin, initial);

  return (
    <div className="login-wrap">
      <form action={formAction} className="card login-card">
        <h1 style={{ marginTop: 0 }}>Painel do proprietário</h1>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {state.error && <p className="error">{state.error}</p>}
        <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

**Manual check** at 320px on `/admin/login`: `document.documentElement.scrollWidth === window.innerWidth`, the card has 16px gutters on both sides, and both fields are 16px so focusing them does not zoom.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/login/LoginForm.tsx src/app/owner/login/OwnerLoginForm.tsx
git commit -m "feat(login): responsive login cards for both panels"
```

---

### Task 11: Part 1 sweep — 320px overflow pass

**Files:** none expected. This task is a verification gate, not a code change.

- [ ] **Step 1: Walk every screen at 320px**

`npm run dev`, devtools device toolbar at **320×568**, logged in as a church admin. On each of `/admin/login`, `/admin/conteudo`, `/admin/conteudo/novo`, `/admin/conteudo/<id>`, `/admin/caixa`, `/admin/caixa/<id>`, `/admin/oracao`, `/admin/configuracoes`, run in the console:

```js
// 1. No horizontal overflow anywhere on the page.
document.documentElement.scrollWidth <= window.innerWidth
// 2. No individual element spilling past its container.
[...document.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible').map((el) => el.className)
// 3. Every interactive control is at least 44px tall.
[...document.querySelectorAll('button, a, input, select, textarea, summary')].filter((el) => el.getBoundingClientRect().height < 44).map((el) => [el.tagName, el.className, el.textContent?.trim().slice(0, 24)])
// 4. No field small enough to make iOS zoom on focus.
[...document.querySelectorAll('input, textarea, select')].filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id)
```

Expected: (1) `true`; (2) empty (the `.thread` is allowed — it scrolls vertically, and its `overflow-x` is not `visible`); (3) empty; (4) empty.

Fix anything that shows up before continuing. Any fix belongs in `globals.css` or the component that owns the element — not in a new stylesheet, and not with `overflow-x: hidden`.

- [ ] **Step 2: Repeat at 390×844 and 430×932** (iPhone 14 / 14 Pro Max) and confirm nothing regressed at desktop width 1280.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(ui): 320px overflow sweep across every panel screen"
```
If nothing needed fixing, skip the commit and record that in the task report.

---

# Part 2 — PWA

Everything below is greenfield: there is no `public/` directory, no manifest, no icon of any kind, no `viewport` export and no service worker in this repo today. Next.js already injects `<meta name="viewport" content="width=device-width, initial-scale=1">` by default, which is why the panel lays out at true device width instead of at 980px — the base behaviour is correct despite nothing being declared.

### Task 12: Viewport, theme colour and icons

**Files:**
- Create: `src/app/icon.svg`, `src/app/icons/art.tsx`, `src/app/icons/192/route.tsx`, `src/app/icons/512/route.tsx`, `src/app/icons/maskable-512/route.tsx`, `src/app/apple-icon.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `ImageResponse` from `next/og` (ships with Next 15.5; no new dependency)
- Produces: `/icons/192`, `/icons/512`, `/icons/maskable-512`, the auto-linked favicon and apple-touch-icon

The artwork is a white cross on `--primary` (`#075e54`), drawn as two rectangles. Deliberately no text: `ImageResponse` needs an embedded font to render glyphs, and shapes need none — one less thing that can fail a build.

- [ ] **Step 1: Favicon**

`src/app/icon.svg` (Next picks this up automatically as the browser-tab icon):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#075e54"/>
  <rect x="27" y="12" width="10" height="40" rx="2" fill="#ffffff"/>
  <rect x="17" y="22" width="30" height="10" rx="2" fill="#ffffff"/>
</svg>
```

- [ ] **Step 2: Shared artwork**

`src/app/icons/art.tsx`:
```tsx
/** The icon artwork, shared by every generated PNG.
 *
 *  Shapes only, no text: ImageResponse renders glyphs through an embedded font,
 *  and shipping one is a build-time failure mode we do not need. Every dimension
 *  is an absolute pixel value because satori does not resolve percentages against
 *  a flex parent the way a browser does.
 *
 *  `scale` shrinks the cross for the Android maskable variant, whose outer 20% on
 *  each side can be cropped to a circle or a squircle by the launcher. */
export function CrossArt({ size, scale = 1 }: { size: number; scale?: number }) {
  const crossWidth = size * 0.46 * scale;
  const crossHeight = size * 0.62 * scale;
  const bar = size * 0.13 * scale;
  const radius = size * 0.03 * scale;

  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        background: '#075e54',
      }}
    >
      <div style={{ display: 'flex', position: 'relative', width: crossWidth, height: crossHeight }}>
        <div
          style={{
            position: 'absolute',
            left: (crossWidth - bar) / 2,
            top: 0,
            width: bar,
            height: crossHeight,
            background: '#ffffff',
            borderRadius: radius,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: crossHeight * 0.26,
            width: crossWidth,
            height: bar,
            background: '#ffffff',
            borderRadius: radius,
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: The three manifest icons**

`src/app/icons/192/route.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { CrossArt } from '../art';

// Rendered once at build time and served from the CDN — no function invocation
// per request, and a broken icon fails `npm run build` rather than production.
export const dynamic = 'force-static';

const SIZE = 192;

export function GET(): Response {
  return new ImageResponse(<CrossArt size={SIZE} />, {
    width: SIZE,
    height: SIZE,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
```

`src/app/icons/512/route.tsx` — identical with `const SIZE = 512;`.

`src/app/icons/maskable-512/route.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { CrossArt } from '../art';

export const dynamic = 'force-static';

const SIZE = 512;

// Android launchers crop a maskable icon to their own shape and may take the
// outer 20% on every side, so the cross is drawn at 80% and the primary-colour
// background carries the bleed.
export function GET(): Response {
  return new ImageResponse(<CrossArt size={SIZE} scale={0.8} />, {
    width: SIZE,
    height: SIZE,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
```

`src/app/apple-icon.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { CrossArt } from './icons/art';

/** iOS ignores manifest icons entirely — the home-screen icon comes from
 *  <link rel="apple-touch-icon">, which Next injects for this file. iOS applies
 *  its own rounded mask, so the art is full-bleed with no transparency. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<CrossArt size={180} />, { ...size });
}
```

- [ ] **Step 4: Viewport and Apple metadata in the root layout**

`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Secretária Virtual — Painel',
  description: 'Painel administrativo da secretária virtual da igreja.',
  applicationName: 'Secretária Virtual',
  // capable: true is what makes an iOS home-screen launch open without the
  // browser URL bar and without the browser back button. It is only safe because
  // Part 1 gave the panel its own always-visible navigation.
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Secretária' },
  // Stops iOS turning church phone numbers in message bodies into blue call links
  // inside the thread.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewportFit: 'cover' is what makes env(safe-area-inset-*) resolve to real
  // values, which the app bar and the bottom tab bar both depend on.
  viewportFit: 'cover',
  themeColor: '#075e54',
  // Deliberately NOT setting maximumScale or userScalable: pinch-zoom is how an
  // older volunteer reads a small label, and taking it away is a real harm.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build && npm test`
Expected: build succeeds and prints `/icons/192`, `/icons/512`, `/icons/maskable-512` as static routes.

If `ImageResponse` fails at build (a satori/resvg WASM problem in this environment), do **not** paper over it with an SVG manifest icon — iOS will not accept an SVG apple-touch-icon, and installability on the target device is the whole point. Generate the four PNGs once with any local tool, commit them under `public/icons/`, point `apple-icon` and the manifest at those static paths, and record the substitution in the task report.

Run `npm start` and check:
- `curl -sI localhost:3000/icons/192 | grep -i content-type` → `image/png`
- View source on `/admin/login`: `<link rel="icon" ... icon.svg>` and `<link rel="apple-touch-icon" ...>` are both present, and `<meta name="theme-color" content="#075e54">` is present.

- [ ] **Step 6: Commit**

```bash
git add src/app/icon.svg src/app/icons src/app/apple-icon.tsx src/app/layout.tsx
git commit -m "feat(pwa): generated icons, theme colour, viewport and Apple web-app metadata"
```

---

### Task 13: Web app manifest

**Files:**
- Create: `src/app/manifest.ts`, `tests/pwa-manifest.test.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest`, auto-linked by Next

- [ ] **Step 1: Write the manifest**

`src/app/manifest.ts`:
```ts
import type { MetadataRoute } from 'next';

/** Next serves this at /manifest.webmanifest and injects the <link rel="manifest">
 *  into every page, so nothing needs to reference it by hand.
 *
 *  Colours come from the same tokens as the stylesheet: theme_color is --primary
 *  and background_color is --bg, so the splash screen and the app bar match the
 *  panel rather than approximating it. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Secretária Virtual — Painel',
    short_name: 'Secretária',
    description: 'Painel da secretária virtual da igreja no WhatsApp.',
    // /admin redirects to /admin/conteudo when signed in and to /admin/login when
    // not, so a cold launch always lands somewhere sensible.
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f7f9',
    theme_color: '#075e54',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['productivity'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android crops "any" icons to its launcher shape and will clip a cross that
      // reaches the edge; the maskable variant is drawn 20% smaller for that.
      { src: '/icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 2: Write the contract test**

`tests/pwa-manifest.test.ts`:
```ts
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
    expect(m.short_name).toBe('Secretária');
    expect(m.short_name.length).toBeLessThanOrEqual(12);
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
```

- [ ] **Step 3: Verify**

Run: `npm test -- tests/pwa-manifest.test.ts && npm test && npm run typecheck && npm run build`
Expected: all pass.

**Manual check** with `npm start`:
- `curl -s localhost:3000/manifest.webmanifest | head` returns the JSON above.
- Chrome devtools → Application → Manifest shows no errors and the install prompt is offered.
- On a real iPhone, Safari → Compartilhar → "Adicionar à Tela de Início" shows the cross icon and the name "Secretária"; launching it opens with no URL bar, and the tab bar from Task 2 is the only navigation — confirm every screen and `Sair` remain reachable.

- [ ] **Step 4: Commit**

```bash
git add src/app/manifest.ts tests/pwa-manifest.test.ts
git commit -m "feat(pwa): installable web app manifest"
```

---

### Task 14: Offline — an honest message, not a fake app

**Files:**
- Create: `src/app/offline/page.tsx`, `public/sw.js`, `src/app/RegisterServiceWorker.tsx`, `src/lib/hooks/use-online.ts`, `src/app/admin/(protected)/ConnectionBanner.tsx`
- Modify: `src/app/layout.tsx`, `src/app/admin/(protected)/layout.tsx`, `src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx`, `tests/pwa-manifest.test.ts`

**Be honest about what this is.** Every screen in this panel is a Server Component rendered from Neon: the menu, the inbox, a conversation, the prayer list. None of them has anything to show without a network. So "offline support" here means exactly three things, and this task builds those three and nothing more:

1. A launch with no signal shows a real pt-BR page instead of the browser's dinosaur or, worse, a blank standalone window with no URL bar and no back button to escape from.
2. A panel already open tells her the connection dropped, so a failed reply reads as "no signal" rather than "the app is broken".
3. The reply button refuses rather than failing.

**What it deliberately does NOT do is cache any church data.** Every admin screen renders member phone numbers, message bodies and prayer requests. Under the LGPD that is the church's members' personal data; caching those responses would leave them readable on a shared parish phone after logout, and would show a secretary a stale conversation she would answer as if it were current. The service worker below stores exactly one thing — the static `/offline` page — and passes everything else straight to the network.

- [ ] **Step 1: The offline page**

`src/app/offline/page.tsx`:
```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sem conexão — Secretária Virtual' };

/** Served by the service worker when a page navigation fails with no network.
 *
 *  Deliberately NOT under src/app/admin: it has to render with no session, no
 *  database and no network, which is precisely what requireReadableSession cannot
 *  do — and tests/privilege-boundary.test.ts would (correctly) demand that guard
 *  of any page.tsx placed there. It shows no church data, so it is safe as a
 *  public route.
 *
 *  Every style is inline. The service worker caches this document but never the
 *  hashed /_next/static CSS bundle, so an external stylesheet would not load and
 *  the page would arrive unstyled at the exact moment it needs to look reassuring. */
export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        margin: 0,
        background: '#f6f7f9',
        color: '#1f2933',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#ffffff',
          border: '1px solid #e3e6ea',
          borderRadius: 10,
          padding: 20,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 40, margin: '0 0 8px' }}>📵</p>
        <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Sem conexão</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: '0 0 8px' }}>
          O painel precisa de internet para mostrar as conversas, o menu e os pedidos de oração.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#6b7280', margin: '0 0 18px' }}>
          Verifique o Wi-Fi ou os dados do celular e tente de novo. Nada do que você já enviou foi perdido.
        </p>
        <a
          href="/admin"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: '10px 18px',
            borderRadius: 8,
            background: '#075e54',
            color: '#ffffff',
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Tentar de novo
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: The service worker**

`public/sw.js` (create the `public/` directory — it does not exist in this repo yet):
```js
/* Secretária Virtual — offline fallback only.
 *
 * This is deliberately NOT an offline-first cache. Every screen in this panel
 * renders member phone numbers, message bodies and prayer requests from the
 * database. Under the LGPD that is the church's members' personal data: caching
 * those responses would leave them readable on a shared parish phone after
 * logout, and would show a secretary a stale conversation she would answer as if
 * it were current. Neither failure is worth a slightly faster second load.
 *
 * So: no admin HTML, no RSC payload, no Server Action response and no API
 * response is ever stored. The only cached entry is /offline, a static page with
 * no church data, served when a whole-page navigation fails for lack of network.
 */
const CACHE = 'sv-offline-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' so a stale HTTP cache entry is not what gets stored.
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Whole-page navigations only. Everything else — RSC payloads, Server Action
  // POSTs, static chunks, blob uploads — goes straight to the network untouched.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(CACHE);
      const fallback = await cache.match(OFFLINE_URL);
      return fallback ?? new Response('Sem conexão.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
```

- [ ] **Step 3: Registration**

`src/app/RegisterServiceWorker.tsx`:
```tsx
'use client';

import { useEffect } from 'react';

/** Registered in production only. In development a service worker serving a
 *  cached shell is a reliable way to spend an hour debugging a change that did
 *  ship — and the offline fallback has no value on localhost anyway.
 *
 *  Failure is swallowed on purpose: the offline page is a courtesy, and a browser
 *  that refuses to register one must not break the panel. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
```

In `src/app/layout.tsx`, add the import and render it:
```tsx
import { RegisterServiceWorker } from './RegisterServiceWorker';
```
```tsx
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
```

- [ ] **Step 4: The connectivity hook and banner**

`src/lib/hooks/use-online.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';

/** navigator.onLine only proves the device has *a* network, not that Neon is
 *  reachable — but "no signal at all" is the case that actually happens in a
 *  church building with thick walls, and it is the one worth naming for her.
 *
 *  Starts optimistic so the server-rendered HTML and the first client render
 *  agree (no hydration mismatch); the real value arrives on the first effect. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
```

`src/app/admin/(protected)/ConnectionBanner.tsx`:
```tsx
'use client';

import { useOnline } from '@/lib/hooks/use-online';

export function ConnectionBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <p className="offline-banner" role="status">
      📵 Sem conexão. Dá para ler o que já está na tela, mas nada será enviado ou salvo até a internet voltar.
    </p>
  );
}
```

In `src/app/admin/(protected)/layout.tsx`, add the import and render it as the first child of `.container`, above the suspension banners:
```tsx
import { ConnectionBanner } from './ConnectionBanner';
```
```tsx
      <div className="container">
        <ConnectionBanner />
        {status === 'suspended' && (
```

- [ ] **Step 5: Make the reply button refuse rather than fail**

In `src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx`, add the import:
```ts
import { useOnline } from '@/lib/hooks/use-online';
```
add inside the component, below `formRef`:
```tsx
  const online = useOnline();
```
change the send button's `disabled` and the hint:
```tsx
        <button className="primary composer-send" type="submit" disabled={pending || !online} aria-label="Enviar resposta">
          {pending ? '…' : '➤'}
        </button>
```
```tsx
      <p className="hint composer-hint">
        {online
          ? `⏱️ Janela de resposta: ~${hoursRemaining}h restantes · Enter envia, Shift+Enter quebra a linha`
          : '📵 Sem conexão — o que você escreveu continua aqui e pode ser enviado quando a internet voltar.'}
      </p>
```
and guard the keyboard path so Enter cannot fire a doomed submit:
```tsx
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!online) return;
              formRef.current?.requestSubmit();
            }
```

- [ ] **Step 6: Extend the PWA contract test**

Append to `tests/pwa-manifest.test.ts`:
```ts
describe('offline behaviour', () => {
  const SW = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
  const OFFLINE = readFileSync(join(ROOT, 'src/app/offline/page.tsx'), 'utf8');

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
});
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass. `tests/privilege-boundary.test.ts` in particular: the new page is at `src/app/offline/page.tsx`, outside the `src/app/admin/(protected)` walk, and no new `page.tsx` was added under admin.

**Manual check** — the service worker only registers in a production build, so use `npm run build && npm start`:
- Load `/admin/conteudo`, then devtools → Application → Service Workers shows `sw.js` activated.
- Application → Cache Storage → `sv-offline-v1` contains **one** entry, `/offline`, and nothing else.
- Devtools → Network → Offline, then reload: the pt-BR offline page appears.
- Back online, on a thread screen: toggle Network → Offline and confirm the banner appears, `➤` goes disabled and the hint changes; toggle back and confirm both revert and `AutoRefresh` catches up.

- [ ] **Step 8: Commit**

```bash
git add src/app/offline public/sw.js src/app/RegisterServiceWorker.tsx src/lib/hooks/use-online.ts "src/app/admin/(protected)/ConnectionBanner.tsx" src/app/layout.tsx "src/app/admin/(protected)/layout.tsx" "src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx" tests/pwa-manifest.test.ts
git commit -m "feat(pwa): honest offline page, data-free service worker, connection banner"
```

---

### Task 15: Final verification

**Files:** none expected.

- [ ] **Step 1: Full suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: 22 test files; 212 original tests plus the new `mobile-css`, `inbox-badge` and `pwa-manifest` tests, **all passing**. Confirm the original 212 count did not drop.

- [ ] **Step 2: Repeat the 320px sweep from Task 11**, now including `/offline` and a `display: standalone` launch.

- [ ] **Step 3: Real-device pass** — one iPhone and one Android, on the deployed preview:

| Check | Screen |
|---|---|
| Install to home screen; icon and name are right | any |
| Launched standalone, every destination and `Sair` are reachable | all |
| No sideways rubber-band while scrolling vertically | all |
| Thread opens at the newest message; reply box on screen | Caixa |
| Keyboard's "enviar" key sends | Caixa |
| Member's new message appears within ~10s without reloading | Caixa |
| Badge on the Caixa tab matches the number in Atendimento | all |
| A camera-roll photo uploads and previews | Conteúdo |
| Reorder ▲▼ hits the intended item every time | Conteúdo |
| One text edited and saved without hunting for the button | Configurações |
| Airplane mode → offline page, then recovery | all |

- [ ] **Step 4: Commit any fixes and finish**

```bash
git add -A
git commit -m "fix(ui): real-device findings from the mobile + PWA pass"
```

---

## What this plan does NOT build

Explicitly out of scope, and deliberately so:

- **Push notifications.** They are their own project, not a checkbox: a permission-request flow that a non-technical user will only ever be asked once and can permanently deny, a `push_subscription` table keyed per admin per device with an expiry and re-subscription path, VAPID keys in the environment, a sender triggered from the webhook's inbound path, per-church quiet hours so nobody is woken at 03:00, and iOS's requirement that the app already be installed to the home screen before it can ask at all. This plan builds the two cheap substitutes instead — the Caixa tab badge (Task 3) and the 10-second auto-refresh (Task 6) — and leaves the rest for a later plan.
- **The native app.** Out of scope by instruction.
- **The public marketing site.** Out of scope by instruction.
- **Any change to what the bot says.** The ten text fields are re-grouped in the UI; their values, names and the `saveTexts` action are untouched.
- **Offline-first caching, background sync, or a queued outbox.** Deliberately rejected in Task 14: the panel's data is members' personal data under the LGPD, and a stale conversation answered as if it were current is worse than a clear "sem conexão".
- **A CSS framework or component library.** Argued against in Global Constraints.
- **Dark mode, animation, and a design refresh.** The tokens would support all three; none of them is why a secretary cannot reach `Sair` today.

## Verification reality

There is no browser harness in this repo and this plan does not add one — jsdom has no layout engine, so it cannot measure an overflow, a tap target or a wrapped row, and adding it would buy a false sense of coverage. What is genuinely automated here is:

- `tests/mobile-css.test.ts` — every responsive declaration this plan depends on, asserted against the real stylesheet. It catches the regression that actually happens: someone tidying `globals.css` and dropping `flex-wrap` or the 16px floor.
- `tests/inbox-badge.test.ts` — the badge count and the conversation ordering, against a real Postgres engine via PGlite.
- `tests/pwa-manifest.test.ts` — installability invariants, the no-zoom-disabling rule, and the service worker's promise not to cache church data. Installability fails silently in the field, so these are the only signal.
- `npm run typecheck` and `npm run build` for everything else, including the generated icons, which are rendered at build time and so fail the build rather than production.

Everything visual — the actual pixel widths, the actual tap accuracy, HEIC conversion, the home-screen install, and the standalone launch — is verified **only** by the manual checks in each task and the device matrix in Task 15. HEIC conversion in particular cannot be verified in device emulation at all, because emulation has no HEIC files. State plainly in each task report which checks were run on real hardware and which were not.

## Self-Review

**Audit coverage:** nav overflow (Task 2) · crushed MenuList label (Tasks 1, 4) · unbounded thread, no scroll-to-newest, no polling (Tasks 6, 7) · sub-44px tap targets everywhere including the 2px-apart reorder pair and the 13px checkbox (Tasks 1, 4, 9) · the 1458px Configurações form (Task 8) · ribbon-shaped prayer text (Tasks 1, 5) · the 180px thread header (Tasks 1, 7) · HEIC rejection, generic error, no thumbnail, no progress, unstyled file input (Task 9) · the login card's 7.5px gutters (Task 10) · 11–13px decision-relevant labels (Task 1) · the input allow-list trap (Task 1) · no `@media` anywhere (Task 1) · PWA greenfield, all of it (Tasks 12–14) · the sequencing caution that standalone display must not ship before the nav fix (Global Constraints, and Part 1 precedes Part 2).

**Placeholder scan:** none. Every step carries complete code and every command states its expected result. Task 11 and Task 15 are verification gates with concrete console snippets rather than code, which is what they are for.

**Type consistency:** `countHandoffContacts(churchId)` has one signature, produced in `src/lib/repo/inbox.ts` and consumed only by the protected layout. `TabBar({ waiting })` is `number`, non-optional, passed `0` in Task 2 and the real count in Task 3. `AutoRefresh({ intervalMs })` defaults to `10_000` and is called with no props from both Caixa screens. `PreparedImage` is the discriminated `{ file } | { error }` union narrowed by `'error' in prepared`. `useOnline(): boolean` has one definition, consumed by `ConnectionBanner` and `ReplyForm`. `manifest()` returns `MetadataRoute.Manifest` and the test imports the same default export the route serves.

**Decisions worth challenging:**

- **A bottom tab bar rather than a wrapping nav.** A wrapped nav would have been a two-line CSS fix, but at 320px it produces a ~120px header on every screen that scrolls away the moment she starts reading, and it leaves `Sair` competing with four destinations for the same row. The tab bar costs one client component and one duplicated concept (identity above, destinations below) and gives thumb-reachable navigation that survives `display: standalone`, where there is no browser back button to fall back on. The cost is the short tab labels — "Ajustes" for Configurações — which is the one place in this plan where a phone constraint overrides naming consistency. Each page's `<h1>` still says the full name, so the tap confirms itself.
- **Enter sends in the reply box.** This is a real risk: a half-composed message can leave for a member. It matches WhatsApp Web, the hint says so in pt-BR, Shift+Enter still breaks the line, and `isComposing` protects Android suggestion input. The alternative — dismissing the keyboard to aim at a button — is the slowest possible way to answer someone who is waiting, which is the exact task this plan says matters most.
- **Converting HEIC in the browser rather than accepting it at the route.** The obvious fix (add `image/heic` to `allowedContentTypes`) makes the upload succeed and the *delivery* fail, because the WhatsApp Cloud API does not accept HEIC — trading a visible error for an invisible one, on the flow used to post the month's calendar. Converting also fixes the 10 MB cap and the frozen-looking upload. It depends on Safari's native HEIC decoding, and when that is unavailable the failure path is a specific, actionable pt-BR message rather than the old "tente novamente".
- **The service worker caches nothing but `/offline`.** The tempting version — cache the shell, cache the last inbox — would make the panel feel faster and would leave members' phone numbers and message bodies on a shared parish phone after logout, and would show a stale conversation as current. Rejected on both LGPD and correctness grounds, and the test asserts the restriction so a future "quick perf win" cannot quietly undo it.
- **Polling every 10 seconds rather than nothing or a socket.** Nothing is the status quo, and it is a page-refresh loop. A socket needs infrastructure Vercel's serverless functions do not give for free. Polling costs one lightweight query per visible tab per 10s, pauses while hidden, and is trivially replaced when push lands.
- **No CSS framework.** Restated in Global Constraints with the cost laid out: rewriting eleven screens' markup and re-verifying 212 tests plus a privilege-boundary guard, to obtain tokens the 57-line stylesheet already defines.

**Known follow-ups (not blocking):** push notifications, as scoped above · a per-request memo for `countHandoffContacts` if the extra count per page load ever shows up in Neon's metrics · `.thread`'s `60vh` is a fixed fraction and could become a flex app shell if the composer ever needs to hug the keyboard on Android · the owner console keeps the old `.nav` and gets only `flex-wrap` as a safety net, since it is a desktop tool for one person.
