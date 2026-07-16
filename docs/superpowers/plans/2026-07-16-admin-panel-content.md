# Admin Panel — Auth + Conteúdo + Configurações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Portuguese, login-protected admin panel where church staff edit every word the bot says, manage the menu (add / edit / reorder / hide / delete, upload the monthly calendar image), set the PIX key and WhatsApp credentials, and manage staff accounts — all without a developer.

**Architecture:** Next.js 15 App Router. Server Components render the screens; Server Actions perform every mutation. Auth is an encrypted iron-session cookie (no session table); passwords are bcrypt hashes in the existing `admin_user` table. The panel writes to the same `church` and `menu_item` columns the bot reads — so editing a "bot string" here changes what the bot says, with nothing hardcoded. Route protection is a server-component layout guard (a route group), reinforced by a session check inside every action.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · React 19 (`useActionState`) · TypeScript strict · iron-session 8 · bcryptjs · @vercel/blob · Drizzle + Neon (existing) · Vitest

**Scope:** This is **Plan A** of the admin panel: **Login + Conteúdo + Configurações**. The **Caixa de Entrada** (inbox) and **Pedidos de Oração** screens are **Plan B**, deferred deliberately — the bot-core's 24h auto-reversion (`src/lib/contact-mode.ts`) already stops a member being stranded in `human` mode without an inbox, so the human side can wait. Prayer requests are captured and stored today; reading them in the UI is Plan B.

**Builds on:** the completed bot-core branch (`feat/bot-core`). This work branches from it (`git checkout -b feat/admin-panel feat/bot-core`), because it depends on the schema, repos, and `db` client that PR #1 introduces.

## Global Constraints

- **The panel edits the bot's DB-backed strings and menu structure — it never introduces a hardcoded bot string.** Every value the bot emits (greeting, fallback, error, prayer prompts, handoff, menu button label, menu header, and every `menu_item.label`/`body_text`) is a column the panel writes. If a task hardcodes a Portuguese *bot* string, that is a bug.
- **The panel's own UI chrome IS hardcoded pt-BR** — labels like "Salvar", "Adicionar item", validation messages, nav. That is correct: it is the app's own interface, not bot output. Do not confuse the two. The entire admin UI is Brazilian Portuguese.
- **Enforce the 10-row WhatsApp list cap.** Activating an item when 10 are already active must be blocked with a pt-BR explanation — never silently allowed. Reuse `WHATSAPP_LIST_MAX_ROWS` (=10) from `src/lib/whatsapp.ts`; do not redefine it.
- **A `content` menu item must never be saved with an empty body AND no image.** The bot would send an empty WhatsApp message (a Graph API 400 — the same failure class the bot-core review caught for empty menus). `prayer` and `human` items carry no body and are exempt.
- **Every mutation is authenticated.** A server-component layout guard protects the screens; additionally, every Server Action calls `requireSession()` before touching data — defense in depth, because a leaked action endpoint must not mutate data.
- **Every query is scoped by `church_id`** — taken from the logged-in admin's session, never from client input. v1 has one church; this is what keeps church #2 a row.
- **The item is "Ofertas" — never "Dízimos e Ofertas".** The word "dízimo" must not be introduced anywhere.
- **iron-session:** `SESSION_SECRET` must be ≥ 32 characters (read lazily, validated at request time — never at module scope, so `next build` does not require it). Cookie `httpOnly`, `sameSite: 'lax'`, `secure` in production.
- **bcryptjs** cost factor **12**.
- **`drizzle-orm` stays ≥ 0.45.2** (GHSA-gpj5-g38j-94v9). Do not downgrade.
- **The neon-http driver has no transaction support** — `db.transaction()` throws. Use per-statement writes.
- **Deferred live verification:** there is still no Neon database. Schema/repo/page code cannot be run against real Postgres here. The gates for DB/UI tasks are `npm run typecheck` and `npm run build`; pure logic is unit-tested with Vitest. Each such task's report must state plainly that its DB/HTTP path never executed.
- **Never commit `.env`.** `DATABASE_URL`, `SESSION_SECRET`, and `BLOB_READ_WRITE_TOKEN` live there; only `.env.example` is committed.
- **Language split:** product/UI strings pt-BR; code identifiers, comments, tests, commit messages, docs English.
- **Node 20+.**

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/layout.tsx` | Root layout (`<html lang="pt-BR">`), imports global CSS |
| `src/app/globals.css` | Minimal panel styling (no CSS framework dependency) |
| `src/app/page.tsx` | `/` → redirect to `/admin` |
| `src/lib/auth/password.ts` | `hashPassword` / `verifyPassword` (bcryptjs) — pure, tested |
| `src/lib/auth/session.ts` | iron-session config, `getSession`, `requireSession`, `isAuthenticated` |
| `src/lib/repo/admin.ts` | `admin_user` queries |
| `src/lib/repo/church-admin.ts` | Read/update the `church` row (texts, name, credentials) |
| `src/lib/repo/menu-admin.ts` | Menu CRUD, reorder, active-count |
| `src/lib/menu-admin-rules.ts` | Pure menu rules (10-row cap, position-from-order) — tested |
| `src/lib/validation.ts` | Pure form validators — tested |
| `src/app/api/blob/upload/route.ts` | Vercel Blob upload-token route (browser uploads client-direct) |
| `scripts/create-admin.ts` | Bootstrap the first login |
| `src/app/admin/login/page.tsx` + `login/actions.ts` + `LoginForm.tsx` | Login (unguarded) |
| `src/app/admin/(protected)/layout.tsx` + `actions.ts` | Guard + nav + logout |
| `src/app/admin/(protected)/page.tsx` | → redirect to `/admin/conteudo` |
| `src/app/admin/(protected)/conteudo/*` | Conteúdo screen + its actions + client components |
| `src/app/admin/(protected)/configuracoes/*` | Configurações screen + its actions + client components |

**Route groups:** `login/` sits OUTSIDE `(protected)/`, so the guard in `(protected)/layout.tsx` never runs for the login page — avoiding a redirect loop. `(protected)` does not appear in URLs, so the paths stay `/admin/login`, `/admin/conteudo`, `/admin/configuracoes`.

## Interfaces Reference (canonical — every task matches these exactly)

```ts
// src/lib/auth/session.ts
export interface SessionData { adminUserId?: string; churchId?: string; name?: string; }
export function isAuthenticated(session: Pick<SessionData, 'adminUserId'>): boolean;
export function getSession(): Promise<import('iron-session').IronSession<SessionData>>;
export function requireSession(): Promise<{ adminUserId: string; churchId: string; name: string }>; // redirects to /admin/login if absent

// src/lib/auth/password.ts
export function hashPassword(plain: string): Promise<string>;
export function verifyPassword(plain: string, hash: string): Promise<boolean>;

// src/lib/repo/admin.ts
export type AdminRecord = typeof import('@/db/schema').adminUser.$inferSelect;
export function findAdminByEmail(email: string): Promise<AdminRecord | undefined>;
export function createAdmin(a: { churchId: string; email: string; passwordHash: string; name: string | null }): Promise<AdminRecord>;
export function listAdmins(churchId: string): Promise<AdminRecord[]>;
export function deleteAdmin(id: string, churchId: string): Promise<void>;    // church-scoped (IDOR-safe)

// src/lib/repo/church-admin.ts
export type ChurchRecord = typeof import('@/db/schema').church.$inferSelect;
export function getChurchRecord(): Promise<ChurchRecord | undefined>;        // the single church (bootstrap/script)
export function getChurchById(churchId: string): Promise<ChurchRecord | undefined>;
export function updateChurch(churchId: string, fields: Partial<typeof import('@/db/schema').church.$inferInsert>): Promise<void>;

// src/lib/repo/menu-admin.ts
export type MenuItemRow = typeof import('@/db/schema').menuItem.$inferSelect;
export function listMenuItemsForAdmin(churchId: string): Promise<MenuItemRow[]>; // ALL items, ordered by position asc
export function createMenuItem(item: { churchId: string; position: number; label: string; bodyText: string; imageUrl: string | null; isActive: boolean; kind: import('@/lib/types').MenuItemKind }): Promise<MenuItemRow>;
export function updateMenuItem(id: string, churchId: string, fields: Partial<typeof import('@/db/schema').menuItem.$inferInsert>): Promise<void>; // church-scoped (IDOR-safe)
export function countActiveMenuItems(churchId: string): Promise<number>;
export function getNextPosition(churchId: string): Promise<number>;
export function reorderMenuItems(churchId: string, orderedIds: string[]): Promise<void>;

// src/lib/menu-admin-rules.ts
export function canActivateAnotherItem(activeCount: number): boolean;         // activeCount < WHATSAPP_LIST_MAX_ROWS
export function positionsFromOrder(orderedIds: string[]): { id: string; position: number }[]; // 1-indexed

// src/lib/validation.ts
export const MENU_BUTTON_MAX = 20;                                           // Meta's interactive-list button (action.button) cap
export const CHURCH_TEXT_MAX = 1024;                                         // tightest bot-text destination limit (list body.text)
export function requireNonEmpty(value: string): boolean;
export function validateLabel(label: string): string | null;                 // pt-BR error, or null if valid
export function validateMenuItemContent(kind: import('@/lib/types').MenuItemKind, bodyText: string, imageUrl: string | null): string | null;
export function validateChurchText(value: string): string | null;            // blank OR over CHURCH_TEXT_MAX (1024) chars
export function validateButtonLabel(value: string): string | null;           // blank OR over MENU_BUTTON_MAX (20) chars

// src/app/api/blob/upload/route.ts — token route for client-direct Blob uploads
export function POST(request: Request): Promise<Response>;                    // authorizes uploads via session; the browser calls @vercel/blob/client `upload()` and only the returned URL passes through the form
```

---

### Task 1: Dependencies, env, root layout, global styles

**Files:**
- Modify: `package.json`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: a buildable app with a root layout and the auth/blob dependencies installed

- [ ] **Step 1: Branch from the bot-core work**

```bash
git checkout feat/bot-core
git checkout -b feat/admin-panel
```

- [ ] **Step 2: Install dependencies**

```bash
npm install iron-session bcryptjs @vercel/blob
npm install -D @types/bcryptjs
```
Expected: no ERR output. Verify `iron-session` resolves to ≥ 8 (`node -p "require('iron-session/package.json').version"`); if it resolves lower, install `iron-session@^8`.

- [ ] **Step 3: Add env vars to `.env.example`**

Append to `.env.example`:
```bash

# Admin panel session cookie encryption key — MUST be at least 32 characters.
# Generate one with: node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"
SESSION_SECRET="change-me-to-a-long-random-string-min-32-chars"

# Vercel Blob write token — auto-injected on Vercel; set locally to test image upload.
BLOB_READ_WRITE_TOKEN=""
```

Also add both (with the placeholder DATABASE_URL that already exists locally) to your gitignored `.env` so `npm run build` and the pure tests run. `SESSION_SECRET` can be any 32+ char string for build.

- [ ] **Step 4: Create the root layout**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Secretária Virtual — Painel',
  description: 'Painel administrativo da secretária virtual da igreja.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create minimal global styles**

`src/app/globals.css`:
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
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
}
a { color: var(--primary); }
.container { max-width: 880px; margin: 0 auto; padding: 24px 16px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
.row { display: flex; align-items: center; gap: 8px; }
.grow { flex: 1; }
label { display: block; font-size: 13px; color: var(--muted); margin: 10px 0 4px; }
input[type=text], input[type=email], input[type=password], textarea, select {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; background: #fff; color: var(--text);
}
textarea { min-height: 90px; resize: vertical; }
button { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid var(--border); padding: 8px 14px; background: #fff; color: var(--text); }
button.primary { background: var(--primary); color: var(--primary-contrast); border-color: var(--primary); }
button.danger { color: var(--danger); border-color: var(--danger); background: #fff; }
.btnlink { display: inline-block; text-decoration: none; font: inherit; border-radius: 8px; border: 1px solid var(--border); padding: 8px 14px; background: #fff; color: var(--text); }
.btnlink.primary { background: var(--primary); color: var(--primary-contrast); border-color: var(--primary); }
.nav { display: flex; gap: 12px; align-items: center; background: var(--card); border-bottom: 1px solid var(--border); padding: 12px 16px; }
.nav .brand { font-weight: 700; }
.nav a { text-decoration: none; padding: 6px 10px; border-radius: 8px; }
.nav a.active { background: #ecfdf5; color: var(--ok); font-weight: 600; }
.error { color: var(--danger); font-size: 13px; margin: 8px 0; }
.hint { color: var(--muted); font-size: 12px; }
.chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.chip.on { background: #d1fae5; color: var(--ok); }
.chip.off { background: #fee2e2; color: var(--danger); }
```

- [ ] **Step 6: Create the root redirect page**

`src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/admin');
}
```

- [ ] **Step 7: Verify build and existing tests**

Run: `npm run build && npm test`
Expected: build succeeds and lists `/` and the existing `/api/whatsapp/webhook`; all 84 existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example src/app/layout.tsx src/app/globals.css src/app/page.tsx
git commit -m "feat: add root layout, panel styles, and auth/blob dependencies"
```

---

### Task 2: Password hashing

**Files:**
- Create: `src/lib/auth/password.ts`
- Test: `tests/password.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

`tests/password.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('sup3r-secret');
    expect(await verifyPassword('sup3r-secret', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('sup3r-secret');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword('sup3r-secret');
    expect(hash).not.toContain('sup3r-secret');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  it('produces a different hash each time (salted)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/password.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/auth/password"`

- [ ] **Step 3: Implement**

`src/lib/auth/password.ts`:
```ts
import bcrypt from 'bcryptjs';

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/password.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password.ts tests/password.test.ts
git commit -m "feat: add bcrypt password hashing"
```

---

### Task 3: Session and auth helpers

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `tests/session.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `SessionData`, `isAuthenticated`, `getSession`, `requireSession` (see Interfaces Reference)

**Note:** only the pure `isAuthenticated` is unit-tested. `getSession`/`requireSession` read cookies and redirect — their real verification is the login flow working end-to-end (deferred). `SESSION_SECRET` is read **lazily inside `getSession`**, never at module scope, so `next build` never requires it.

- [ ] **Step 1: Write the failing test**

`tests/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAuthenticated } from '@/lib/auth/session';

describe('isAuthenticated', () => {
  it('is true when a session carries an admin id', () => {
    expect(isAuthenticated({ adminUserId: 'abc' })).toBe(true);
  });

  it('is false for an empty session', () => {
    expect(isAuthenticated({})).toBe(false);
  });

  it('is false when the id is an empty string', () => {
    expect(isAuthenticated({ adminUserId: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/session.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/auth/session"`

- [ ] **Step 3: Implement**

`src/lib/auth/session.ts`:
```ts
import { getIronSession, type IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface SessionData {
  adminUserId?: string;
  churchId?: string;
  name?: string;
}

const COOKIE_NAME = 'sv_admin';

/** Pure guard used by both the layout and every action. */
export function isAuthenticated(session: Pick<SessionData, 'adminUserId'>): boolean {
  return typeof session.adminUserId === 'string' && session.adminUserId.length > 0;
}

/** Read SESSION_SECRET lazily so `next build` never requires it. */
function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters.');
  }
  return secret;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    password: sessionPassword(),
    cookieName: COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  });
}

/** For Server Actions: returns the authenticated identity, or redirects to login.
 *  redirect() throws a control-flow signal, so nothing after it runs. */
export async function requireSession(): Promise<{ adminUserId: string; churchId: string; name: string }> {
  const session = await getSession();
  if (!isAuthenticated(session) || !session.churchId) {
    redirect('/admin/login');
  }
  return {
    adminUserId: session.adminUserId!,
    churchId: session.churchId!,
    name: session.name ?? '',
  };
}
```

- [ ] **Step 4: Run test and typecheck**

Run: `npm test -- tests/session.test.ts && npm run typecheck`
Expected: 3 PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts tests/session.test.ts
git commit -m "feat: add iron-session config and auth guards"
```

---

### Task 4: Admin repository and the create-admin bootstrap script

**Files:**
- Create: `src/lib/repo/admin.ts`, `src/lib/repo/church-admin.ts`, `scripts/create-admin.ts`
- Modify: `package.json` (add `create-admin` script)

**Interfaces:**
- Consumes: `db` from `@/db/client`; `adminUser`, `church` from `@/db/schema`; `hashPassword` from `@/lib/auth/password`
- Produces: the `admin.ts` and `church-admin.ts` functions in the Interfaces Reference

**No live DB.** Gate: `npm run typecheck`. The script and queries never execute here — the report must say so.

- [ ] **Step 1: Create the admin repository**

`src/lib/repo/admin.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { adminUser } from '@/db/schema';

export type AdminRecord = typeof adminUser.$inferSelect;

export async function findAdminByEmail(email: string): Promise<AdminRecord | undefined> {
  const rows = await db.select().from(adminUser).where(eq(adminUser.email, email)).limit(1);
  return rows[0];
}

export async function createAdmin(a: {
  churchId: string;
  email: string;
  passwordHash: string;
  name: string | null;
}): Promise<AdminRecord> {
  const [created] = await db.insert(adminUser).values(a).returning();
  return created;
}

export async function listAdmins(churchId: string): Promise<AdminRecord[]> {
  return db.select().from(adminUser).where(eq(adminUser.churchId, churchId));
}

/** Church-scoped so one church's admin can never delete another church's staff by id. */
export async function deleteAdmin(id: string, churchId: string): Promise<void> {
  await db.delete(adminUser).where(and(eq(adminUser.id, id), eq(adminUser.churchId, churchId)));
}
```

- [ ] **Step 2: Create the church-admin repository**

`src/lib/repo/church-admin.ts`:
```ts
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { church } from '@/db/schema';

export type ChurchRecord = typeof church.$inferSelect;

/** The single church row — used by the bootstrap script. v1 has exactly one. */
export async function getChurchRecord(): Promise<ChurchRecord | undefined> {
  const rows = await db.select().from(church).limit(1);
  return rows[0];
}

export async function getChurchById(churchId: string): Promise<ChurchRecord | undefined> {
  const rows = await db.select().from(church).where(eq(church.id, churchId)).limit(1);
  return rows[0];
}

export async function updateChurch(
  churchId: string,
  fields: Partial<typeof church.$inferInsert>,
): Promise<void> {
  // Strip id so a caller can never repoint the church row's primary key via .set().
  const { id: _id, ...safeFields } = fields;
  await db.update(church).set(safeFields).where(eq(church.id, churchId));
}
```

- [ ] **Step 3: Create the bootstrap script**

`scripts/create-admin.ts`:
```ts
import 'dotenv/config';
import { getChurchRecord } from '../src/lib/repo/church-admin';
import { createAdmin, findAdminByEmail } from '../src/lib/repo/admin';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> [name]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const churchRow = await getChurchRecord();
  if (!churchRow) {
    console.error('No church row found. Run `npm run db:seed` first.');
    process.exitCode = 1;
    return;
  }

  if (await findAdminByEmail(email)) {
    console.error(`An admin with email ${email} already exists.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  await createAdmin({ churchId: churchRow.id, email, passwordHash, name: name ?? null });
  console.log(`Admin created: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, add:
```json
    "create-admin": "tsx scripts/create-admin.ts",
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repo/admin.ts src/lib/repo/church-admin.ts scripts/create-admin.ts package.json
git commit -m "feat: add admin and church-admin repositories and the create-admin script"
```

---

### Task 5: Login, logout, and the protected layout guard

**Files:**
- Create: `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`, `src/app/admin/login/LoginForm.tsx`
- Create: `src/app/admin/(protected)/layout.tsx`, `src/app/admin/(protected)/actions.ts`, `src/app/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: `getSession`, `requireSession`, `isAuthenticated` from `@/lib/auth/session`; `findAdminByEmail` from `@/lib/repo/admin`; `verifyPassword` from `@/lib/auth/password`
- Produces: a working login/logout flow and a guarded `/admin/*` area

**No live DB.** Gate: `npm run typecheck && npm run build`. The login POST never executes here.

- [ ] **Step 1: Login server action**

`src/app/admin/login/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { findAdminByEmail } from '@/lib/repo/admin';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getSession } from '@/lib/auth/session';

export interface LoginState {
  error?: string;
}

// A fixed-cost decoy hash so an unknown email still incurs a real bcrypt compare —
// response time must not reveal whether an email exists. Computed once, lazily.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('timing-decoy-value');
  return decoyHash;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Informe e-mail e senha.' };
  }

  const admin = await findAdminByEmail(email);
  // Always run exactly one bcrypt compare — against the real hash, or the decoy
  // of the same cost when the email is unknown — so timing never leaks existence.
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await getDecoyHash()));

  if (!admin || !ok) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  const session = await getSession();
  session.adminUserId = admin.id;
  session.churchId = admin.churchId;
  session.name = admin.name ?? '';
  await session.save();

  redirect('/admin/conteudo');
}
```

- [ ] **Step 2: Login form (client component)**

`src/app/admin/login/LoginForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <form action={formAction} className="card" style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1 style={{ marginTop: 0 }}>Entrar</h1>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Senha</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {state.error && <p className="error">{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12, width: '100%' }}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Login page (redirects away if already authed)**

`src/app/admin/login/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (isAuthenticated(session)) {
    redirect('/admin/conteudo');
  }
  return <LoginForm />;
}
```

- [ ] **Step 4: Logout action**

`src/app/admin/(protected)/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect('/admin/login');
}
```

- [ ] **Step 5: Protected layout (the guard + nav)**

`src/app/admin/(protected)/layout.tsx`:
```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { logout } from './actions';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isAuthenticated(session)) {
    redirect('/admin/login');
  }

  return (
    <div>
      <nav className="nav">
        <span className="brand">⛪ Secretária Virtual</span>
        <Link href="/admin/conteudo">Conteúdo</Link>
        <Link href="/admin/configuracoes">Configurações</Link>
        <span className="grow" />
        <span className="hint">{session.name}</span>
        <form action={logout}>
          <button type="submit">Sair</button>
        </form>
      </nav>
      <div className="container">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Protected index → Conteúdo**

`src/app/admin/(protected)/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function AdminIndex() {
  redirect('/admin/conteudo');
}
```

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/admin/login` and `/admin` routes and succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin
git commit -m "feat: add login, logout, and the protected admin layout guard"
```

---

### Task 6: Pure menu rules and form validation

**Files:**
- Create: `src/lib/menu-admin-rules.ts`, `src/lib/validation.ts`
- Test: `tests/menu-admin-rules.test.ts`, `tests/validation.test.ts`

**Interfaces:**
- Consumes: `WHATSAPP_LIST_MAX_ROWS` from `@/lib/whatsapp`; `MenuItemKind` from `@/lib/types`
- Produces: `canActivateAnotherItem`, `positionsFromOrder`, `requireNonEmpty`, `validateLabel`, `validateMenuItemContent`, `validateChurchText`

- [ ] **Step 1: Write the failing tests**

`tests/menu-admin-rules.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { canActivateAnotherItem, positionsFromOrder } from '@/lib/menu-admin-rules';

describe('canActivateAnotherItem', () => {
  it('allows activation below the 10-row cap', () => {
    expect(canActivateAnotherItem(9)).toBe(true);
  });
  it('blocks activation at the cap', () => {
    expect(canActivateAnotherItem(10)).toBe(false);
  });
});

describe('positionsFromOrder', () => {
  it('assigns 1-indexed positions in order', () => {
    expect(positionsFromOrder(['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
      { id: 'b', position: 3 },
    ]);
  });
  it('handles an empty list', () => {
    expect(positionsFromOrder([])).toEqual([]);
  });
});
```

`tests/validation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { requireNonEmpty, validateLabel, validateMenuItemContent, validateChurchText } from '@/lib/validation';

describe('requireNonEmpty', () => {
  it.each(['', '   ', '\n'])('is false for blank %j', (v) => expect(requireNonEmpty(v)).toBe(false));
  it('is true for real text', () => expect(requireNonEmpty(' oi ')).toBe(true));
});

describe('validateLabel', () => {
  it('rejects a blank label', () => expect(validateLabel('  ')).not.toBeNull());
  it('accepts a real label', () => expect(validateLabel('⛪ Horários')).toBeNull());
});

describe('validateMenuItemContent', () => {
  it('rejects a content item with no body and no image', () => {
    expect(validateMenuItemContent('content', '   ', null)).not.toBeNull();
  });
  it('accepts a content item with a body', () => {
    expect(validateMenuItemContent('content', 'Cultos aos domingos', null)).toBeNull();
  });
  it('accepts a content item with only an image', () => {
    expect(validateMenuItemContent('content', '', 'https://blob/cal.png')).toBeNull();
  });
  it('accepts prayer and human items with no body', () => {
    expect(validateMenuItemContent('prayer', '', null)).toBeNull();
    expect(validateMenuItemContent('human', '', null)).toBeNull();
  });
});

describe('validateChurchText', () => {
  it('rejects blank bot text', () => expect(validateChurchText('   ')).not.toBeNull());
  it('accepts real bot text', () => expect(validateChurchText('Olá! 🙏')).toBeNull());
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/menu-admin-rules.test.ts tests/validation.test.ts`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement the rules**

`src/lib/menu-admin-rules.ts`:
```ts
import { WHATSAPP_LIST_MAX_ROWS } from './whatsapp';

/** WhatsApp interactive lists cap at 10 rows. Never allow an 11th active item. */
export function canActivateAnotherItem(activeCount: number): boolean {
  return activeCount < WHATSAPP_LIST_MAX_ROWS;
}

/** Turn a drag/move-ordered id list into 1-indexed positions. */
export function positionsFromOrder(orderedIds: string[]): { id: string; position: number }[] {
  return orderedIds.map((id, index) => ({ id, position: index + 1 }));
}
```

- [ ] **Step 4: Implement validation**

`src/lib/validation.ts`:
```ts
import type { MenuItemKind } from './types';

/** Meta's interactive-list button (`action.button`) caps at 20 characters. */
export const MENU_BUTTON_MAX = 20;
/** Safe for every bot-text destination: list `body.text` caps at 1024, plain
 *  text messages at 4096 — 1024 is the tightest limit any of these values hits. */
export const CHURCH_TEXT_MAX = 1024;

export function requireNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function validateLabel(label: string): string | null {
  return requireNonEmpty(label) ? null : 'O rótulo não pode ficar em branco.';
}

/** The WhatsApp interactive-list button label. A value over Meta's 20-char cap
 *  makes every menu send fail (Graph 400), silently killing the bot's core
 *  feature — so this is stricter than the generic bot-text validator. */
export function validateButtonLabel(value: string): string | null {
  if (!requireNonEmpty(value)) return 'O rótulo do botão não pode ficar em branco.';
  if (value.trim().length > MENU_BUTTON_MAX) {
    return `O rótulo do botão deve ter no máximo ${MENU_BUTTON_MAX} caracteres.`;
  }
  return null;
}

/** A content item with neither body nor image would make the bot send an empty
 *  WhatsApp message (a Graph API 400). Prayer/human items carry no body. */
export function validateMenuItemContent(
  kind: MenuItemKind,
  bodyText: string,
  imageUrl: string | null,
): string | null {
  if (kind !== 'content') return null;
  if (requireNonEmpty(bodyText) || (imageUrl && imageUrl.length > 0)) return null;
  return 'Um item de conteúdo precisa de um texto ou de uma imagem.';
}

export function validateChurchText(value: string): string | null {
  if (!requireNonEmpty(value)) return 'Este texto não pode ficar em branco.';
  if (value.length > CHURCH_TEXT_MAX) {
    return `Este texto é muito longo (máximo ${CHURCH_TEXT_MAX} caracteres).`;
  }
  return null;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- tests/menu-admin-rules.test.ts tests/validation.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/menu-admin-rules.ts src/lib/validation.ts tests/menu-admin-rules.test.ts tests/validation.test.ts
git commit -m "feat: add pure menu rules and form validation"
```

---

### Task 7: Menu-admin repository

**Files:**
- Create: `src/lib/repo/menu-admin.ts`

**Interfaces:**
- Consumes: `db`, `menuItem` schema, `MenuItemKind`, `positionsFromOrder` from `@/lib/menu-admin-rules`
- Produces: the `menu-admin.ts` functions in the Interfaces Reference

**No live DB.** Gate: `npm run typecheck`.

- [ ] **Step 1: Implement**

`src/lib/repo/menu-admin.ts`:
```ts
import { and, asc, count, eq, max } from 'drizzle-orm';
import { db } from '@/db/client';
import { menuItem } from '@/db/schema';
import type { MenuItemKind } from '@/lib/types';
import { positionsFromOrder } from '@/lib/menu-admin-rules';

export type MenuItemRow = typeof menuItem.$inferSelect;

export async function listMenuItemsForAdmin(churchId: string): Promise<MenuItemRow[]> {
  return db
    .select()
    .from(menuItem)
    .where(eq(menuItem.churchId, churchId))
    .orderBy(asc(menuItem.position));
}

export async function createMenuItem(item: {
  churchId: string;
  position: number;
  label: string;
  bodyText: string;
  imageUrl: string | null;
  isActive: boolean;
  kind: MenuItemKind;
}): Promise<MenuItemRow> {
  const [created] = await db.insert(menuItem).values(item).returning();
  return created;
}

/** Church-scoped: a mutation for an id that is not this church's is a no-op, so one
 *  church can never edit or hide another church's menu item. */
export async function updateMenuItem(
  id: string,
  churchId: string,
  fields: Partial<typeof menuItem.$inferInsert>,
): Promise<void> {
  // Strip id/churchId from the payload: the WHERE guards which row is touched, this
  // guards what it is set to — so a caller can never repoint an item to another
  // church or change its id via .set().
  const { id: _id, churchId: _churchId, ...safeFields } = fields;
  await db.update(menuItem).set(safeFields).where(and(eq(menuItem.id, id), eq(menuItem.churchId, churchId)));
}

export async function countActiveMenuItems(churchId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(menuItem)
    .where(and(eq(menuItem.churchId, churchId), eq(menuItem.isActive, true)));
  return rows[0]?.n ?? 0;
}

export async function getNextPosition(churchId: string): Promise<number> {
  const rows = await db
    .select({ maxPos: max(menuItem.position) })
    .from(menuItem)
    .where(eq(menuItem.churchId, churchId));
  return (rows[0]?.maxPos ?? 0) + 1;
}

/** The neon-http driver has no transactions, so positions are written one row at
 *  a time. Positions are recomputed from the full order, so a partial failure
 *  leaves a consistent (if briefly reordered) menu rather than duplicate indices. */
export async function reorderMenuItems(churchId: string, orderedIds: string[]): Promise<void> {
  const positions = positionsFromOrder(orderedIds);
  for (const { id, position } of positions) {
    await db
      .update(menuItem)
      .set({ position })
      .where(and(eq(menuItem.id, id), eq(menuItem.churchId, churchId)));
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/repo/menu-admin.ts
git commit -m "feat: add menu-admin repository with reorder and active-count"
```

---

### Task 8: Client-direct Vercel Blob uploads (token route)

**Files:**
- Create: `src/app/api/blob/upload/route.ts`

**Interfaces:**
- Consumes: `handleUpload` from `@vercel/blob/client`; `getSession`, `isAuthenticated` from `@/lib/auth/session`
- Produces: `POST(request: Request): Promise<Response>` — the upload-token endpoint

**Why client-direct, not a Server Action:** the monthly-calendar image must not transit a Server Action — Next.js caps action bodies at **1 MB** and Vercel caps request bodies at **~4.5 MB**, but a phone photo of a printed calendar is routinely larger. The browser uploads the file straight to Vercel Blob with `@vercel/blob/client`'s `upload()`; this route only mints a short-lived, session-gated token, so nothing large passes through our server. The item form then carries only the returned URL string.

**No live upload.** Gate: `npm run typecheck && npm run build`. The real upload is verified during the end-to-end test.

- [ ] **Step 1: Implement the token route**

`src/app/api/blob/upload/route.ts`:
```ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getSession, isAuthenticated } from '@/lib/auth/session';

/** Mints upload tokens so the admin's browser uploads menu images directly to
 *  Vercel Blob. Only an authenticated admin may obtain a token. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getSession();
        if (!isAuthenticated(session)) {
          throw new Error('Não autorizado.');
        }
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      // No post-upload bookkeeping — the URL is persisted when the item form is saved.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/api/blob/upload` and succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/blob/upload/route.ts"
git commit -m "feat: add session-gated Vercel Blob upload token route"
```

---

### Task 9: Conteúdo — list, toggle active, reorder, delete

**Files:**
- Create: `src/app/admin/(protected)/conteudo/page.tsx`, `src/app/admin/(protected)/conteudo/actions.ts`, `src/app/admin/(protected)/conteudo/MenuList.tsx`

**Interfaces:**
- Consumes: `requireSession`; `listMenuItemsForAdmin`, `countActiveMenuItems`, `updateMenuItem`, `reorderMenuItems` from `@/lib/repo/menu-admin`; `canActivateAnotherItem` from `@/lib/menu-admin-rules`
- Produces: the Conteúdo listing with toggle/reorder actions

**No live DB.** Gate: `npm run typecheck && npm run build`.

- [ ] **Step 1: Conteúdo actions**

`src/app/admin/(protected)/conteudo/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import {
  countActiveMenuItems,
  listMenuItemsForAdmin,
  reorderMenuItems,
  updateMenuItem,
} from '@/lib/repo/menu-admin';
import { canActivateAnotherItem } from '@/lib/menu-admin-rules';

export interface ActionResult {
  error?: string;
}

/** Toggling to active is gated on the 10-row WhatsApp cap. updateMenuItem is
 *  church-scoped, so an id from another church is a silent no-op. */
export async function setItemActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { churchId } = await requireSession();

  if (isActive) {
    const active = await countActiveMenuItems(churchId);
    if (!canActivateAnotherItem(active)) {
      return { error: 'O menu do WhatsApp permite no máximo 10 itens ativos. Oculte outro antes de ativar este.' };
    }
  }

  await updateMenuItem(id, churchId, { isActive });
  revalidatePath('/admin/conteudo');
  return {};
}

export async function moveItem(id: string, direction: 'up' | 'down'): Promise<ActionResult> {
  const { churchId } = await requireSession();
  const items = await listMenuItemsForAdmin(churchId);
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return {};

  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= items.length) return {};

  const ordered = items.map((i) => i.id);
  [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];

  await reorderMenuItems(churchId, ordered);
  revalidatePath('/admin/conteudo');
  return {};
}
```

- [ ] **Step 2: Menu list (client component)**

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
        <div key={item.id} className="card row">
          <div className="row" style={{ flexDirection: 'column', gap: 2 }}>
            <button disabled={pending || index === 0} onClick={() => run(() => moveItem(item.id, 'up'))} aria-label="Mover para cima">▲</button>
            <button disabled={pending || index === items.length - 1} onClick={() => run(() => moveItem(item.id, 'down'))} aria-label="Mover para baixo">▼</button>
          </div>
          <span className="grow">
            {item.label}
            {item.hasImage && <span className="hint"> 📎 imagem</span>}
            {item.kind !== 'content' && <span className="hint"> · {item.kind === 'prayer' ? 'oração' : 'atendente'}</span>}
          </span>
          <span className={`chip ${item.isActive ? 'on' : 'off'}`}>{item.isActive ? 'Ativo' : 'Oculto'}</span>
          <button disabled={pending} onClick={() => run(() => setItemActive(item.id, !item.isActive))}>
            {item.isActive ? 'Ocultar' : 'Ativar'}
          </button>
          <Link className="btnlink" href={`/admin/conteudo/${item.id}`}>Editar</Link>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Conteúdo page**

`src/app/admin/(protected)/conteudo/page.tsx`:
```tsx
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { countActiveMenuItems, listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { WHATSAPP_LIST_MAX_ROWS } from '@/lib/whatsapp';
import { MenuList, type MenuListItem } from './MenuList';

export default async function ConteudoPage() {
  const { churchId } = await requireSession();
  const rows = await listMenuItemsForAdmin(churchId);
  const active = await countActiveMenuItems(churchId);

  const items: MenuListItem[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    isActive: r.isActive,
    hasImage: !!r.imageUrl,
  }));

  return (
    <div>
      <div className="row">
        <h1 className="grow">Conteúdo do menu</h1>
        <Link className="btnlink primary" href="/admin/conteudo/novo">+ Novo item</Link>
      </div>
      <p className="hint">
        {active} de {WHATSAPP_LIST_MAX_ROWS} itens ativos. Use ▲▼ para reordenar; “Ocultar” tira do menu sem apagar o conteúdo.
        Se o menu já estiver cheio (10 ativos), um item novo é salvo como <strong>Oculto</strong> — oculte outro para ativá-lo.
      </p>
      <MenuList items={items} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/admin/conteudo` and succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(protected)/conteudo"
git commit -m "feat: Conteúdo screen — list, toggle, reorder menu items"
```

---

### Task 10: Conteúdo — add and edit item (with image upload)

**Files:**
- Create: `src/app/admin/(protected)/conteudo/novo/page.tsx`, `src/app/admin/(protected)/conteudo/[id]/page.tsx`, `src/app/admin/(protected)/conteudo/ItemForm.tsx`, `src/app/admin/(protected)/conteudo/item-actions.ts`

**Interfaces:**
- Consumes: `requireSession`; `createMenuItem`, `updateMenuItem`, `getNextPosition`, `listMenuItemsForAdmin`, `countActiveMenuItems` from `@/lib/repo/menu-admin`; `canActivateAnotherItem` from `@/lib/menu-admin-rules`; `validateLabel`, `validateMenuItemContent` from `@/lib/validation`; `upload` from `@vercel/blob/client` (client-side, inside ItemForm)
- Produces: create/edit flows writing to `menu_item`

**No live DB/upload.** Gate: `npm run typecheck && npm run build`.

- [ ] **Step 1: Item actions (create + edit)**

`src/app/admin/(protected)/conteudo/item-actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import {
  countActiveMenuItems,
  createMenuItem,
  getNextPosition,
  listMenuItemsForAdmin,
  updateMenuItem,
} from '@/lib/repo/menu-admin';
import { canActivateAnotherItem } from '@/lib/menu-admin-rules';
import { validateLabel, validateMenuItemContent } from '@/lib/validation';
import type { MenuItemKind } from '@/lib/types';

export interface ItemFormState {
  error?: string;
}

function parseKind(value: FormDataEntryValue | null): MenuItemKind {
  return value === 'prayer' || value === 'human' ? value : 'content';
}

/** The browser uploads the image straight to Vercel Blob (Task 8) and submits only
 *  the resulting URL string in `imageUrl` — no file transits this Server Action. */
function resolveImageUrl(formData: FormData, existing: string | null): string | null {
  const uploaded = String(formData.get('imageUrl') ?? '').trim();
  if (uploaded) return uploaded;
  if (formData.get('removeImage') === 'on') return null;
  return existing;
}

export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const { churchId } = await requireSession();

  const label = String(formData.get('label') ?? '').trim();
  const bodyText = String(formData.get('bodyText') ?? '');
  const kind = parseKind(formData.get('kind'));

  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  const imageUrl = resolveImageUrl(formData, null);

  const contentError = validateMenuItemContent(kind, bodyText, imageUrl);
  if (contentError) return { error: contentError };

  // A new item goes live only if the menu is not already at 10 active rows;
  // otherwise it is saved hidden, never silently pushing the WhatsApp list over.
  const active = await countActiveMenuItems(churchId);
  const isActive = canActivateAnotherItem(active);

  const position = await getNextPosition(churchId);
  await createMenuItem({ churchId, position, label, bodyText, imageUrl, isActive, kind });
  redirect('/admin/conteudo');
}

export async function editItem(id: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const { churchId } = await requireSession();

  const items = await listMenuItemsForAdmin(churchId);
  const current = items.find((i) => i.id === id);
  if (!current) return { error: 'Item não encontrado.' };

  const label = String(formData.get('label') ?? '').trim();
  const bodyText = String(formData.get('bodyText') ?? '');
  const kind = parseKind(formData.get('kind'));

  const labelError = validateLabel(label);
  if (labelError) return { error: labelError };

  const imageUrl = resolveImageUrl(formData, current.imageUrl);

  const contentError = validateMenuItemContent(kind, bodyText, imageUrl);
  if (contentError) return { error: contentError };

  await updateMenuItem(id, churchId, { label, bodyText, kind, imageUrl });
  redirect('/admin/conteudo');
}
```

- [ ] **Step 2: Item form (client component)**

`src/app/admin/(protected)/conteudo/ItemForm.tsx`:
```tsx
'use client';

import { useActionState, useState } from 'react';
import { upload } from '@vercel/blob/client';
import type { ItemFormState } from './item-actions';

export interface ItemFormValues {
  label: string;
  bodyText: string;
  kind: 'content' | 'prayer' | 'human';
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
  const [imageUrl, setImageUrl] = useState<string>(values.imageUrl ?? '');
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
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
      <label htmlFor="label">Rótulo (aparece no menu)</label>
      <input id="label" name="label" type="text" defaultValue={values.label} required />

      <label htmlFor="kind">Tipo</label>
      <select id="kind" name="kind" defaultValue={values.kind}>
        <option value="content">Conteúdo (responde com um texto/imagem)</option>
        <option value="prayer">Pedido de oração</option>
        <option value="human">Falar com atendente</option>
      </select>

      <label htmlFor="bodyText">Texto da resposta</label>
      <textarea id="bodyText" name="bodyText" defaultValue={values.bodyText} />
      <p className="hint">Deixe em branco para itens de oração ou atendente.</p>

      <label htmlFor="image">Imagem (opcional — ex.: calendário do mês)</label>
      <input id="image" type="file" accept="image/*" onChange={onFileChange} disabled={uploading} />
      {uploading && <p className="hint">Enviando imagem…</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {imageUrl && (
        <p className="hint">
          Imagem anexada ✓{' '}
          <label style={{ display: 'inline' }}>
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

- [ ] **Step 3: New-item page**

`src/app/admin/(protected)/conteudo/novo/page.tsx`:
```tsx
import { requireSession } from '@/lib/auth/session';
import { ItemForm } from '../ItemForm';
import { createItem } from '../item-actions';

export default async function NovoItemPage() {
  await requireSession();
  return (
    <div>
      <h1>Novo item</h1>
      <ItemForm action={createItem} submitLabel="Criar item" values={{ label: '', bodyText: '', kind: 'content', imageUrl: null }} />
    </div>
  );
}
```

- [ ] **Step 4: Edit-item page**

`src/app/admin/(protected)/conteudo/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { ItemForm } from '../ItemForm';
import { editItem } from '../item-actions';

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { churchId } = await requireSession();
  const items = await listMenuItemsForAdmin(churchId);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();

  const editThisItem = editItem.bind(null, id);

  return (
    <div>
      <h1>Editar item</h1>
      <ItemForm
        action={editThisItem}
        submitLabel="Salvar alterações"
        values={{ label: item.label, bodyText: item.bodyText, kind: item.kind, imageUrl: item.imageUrl }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/admin/conteudo/novo` and `/admin/conteudo/[id]` and succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(protected)/conteudo"
git commit -m "feat: Conteúdo screen — add and edit items with image upload"
```

---

### Task 11: Configurações — bot texts, church name, WhatsApp credentials, staff

**Files:**
- Create: `src/app/admin/(protected)/configuracoes/page.tsx`, `src/app/admin/(protected)/configuracoes/actions.ts`, `src/app/admin/(protected)/configuracoes/TextsForm.tsx`, `src/app/admin/(protected)/configuracoes/CredentialsForm.tsx`, `src/app/admin/(protected)/configuracoes/StaffManager.tsx`

**Interfaces:**
- Consumes: `requireSession`; `getChurchById`, `updateChurch` from `@/lib/repo/church-admin`; `listAdmins`, `createAdmin`, `deleteAdmin`, `findAdminByEmail` from `@/lib/repo/admin`; `hashPassword` from `@/lib/auth/password`; `validateChurchText`, `validateLabel` from `@/lib/validation`
- Produces: the Configurações screen

**No live DB.** Gate: `npm run typecheck && npm run build`.

**The editable bot-text fields (all `church` columns):** `name`, `greetingText`, `menuHeaderText`, `menuButtonLabel`, `fallbackText`, `unsupportedMediaText`, `errorText`, `prayerPromptText`, `prayerThanksText`, `handoffText`, `handoffClosedText`. Editing these IS editing what the bot says — that is the point of the panel.

- [ ] **Step 1: Configurações actions**

`src/app/admin/(protected)/configuracoes/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { getChurchById, updateChurch } from '@/lib/repo/church-admin';
import { createAdmin, deleteAdmin, findAdminByEmail } from '@/lib/repo/admin';
import { hashPassword } from '@/lib/auth/password';
import { validateButtonLabel, validateChurchText, validateLabel } from '@/lib/validation';

export interface ConfigResult {
  error?: string;
  ok?: boolean;
}

// The bot-text columns a church always has, validated by validateChurchText.
// name uses validateLabel; menuButtonLabel uses validateButtonLabel (Meta's
// 20-char interactive-list button cap) — both are validated separately below.
const TEXT_FIELDS = [
  'greetingText', 'menuHeaderText', 'fallbackText',
  'unsupportedMediaText', 'errorText', 'prayerPromptText', 'prayerThanksText',
  'handoffText', 'handoffClosedText',
] as const;

export async function saveTexts(_prev: ConfigResult, formData: FormData): Promise<ConfigResult> {
  const { churchId } = await requireSession();

  const name = String(formData.get('name') ?? '').trim();
  const nameError = validateLabel(name);
  if (nameError) return { error: `Nome da igreja: ${nameError}` };

  const menuButtonLabel = String(formData.get('menuButtonLabel') ?? '');
  const buttonError = validateButtonLabel(menuButtonLabel);
  if (buttonError) return { error: `Rótulo do botão: ${buttonError}` };

  const fields: Record<string, string> = { name, menuButtonLabel };
  for (const key of TEXT_FIELDS) {
    const value = String(formData.get(key) ?? '');
    const err = validateChurchText(value);
    if (err) return { error: `Há um campo em branco ou muito longo. Revise os textos do bot.` };
    fields[key] = value;
  }

  await updateChurch(churchId, fields);
  revalidatePath('/admin/configuracoes');
  return { ok: true };
}

export async function saveCredentials(_prev: ConfigResult, formData: FormData): Promise<ConfigResult> {
  const { churchId } = await requireSession();

  // phone_number_id and the verify token are not secret — always save them.
  const fields: Parameters<typeof updateChurch>[1] = {
    phoneNumberId: String(formData.get('phoneNumberId') ?? '').trim() || null,
    webhookVerifyToken: String(formData.get('webhookVerifyToken') ?? '').trim() || null,
  };

  // Secrets never round-trip to the browser, so a field is blank unless the admin
  // deliberately typed a new value. A blank submission must KEEP the stored secret,
  // not wipe it — so include the column ONLY when a non-empty value was entered.
  const accessToken = String(formData.get('accessToken') ?? '').trim();
  if (accessToken) fields.accessToken = accessToken;
  const appSecret = String(formData.get('appSecret') ?? '').trim();
  if (appSecret) fields.appSecret = appSecret;

  await updateChurch(churchId, fields);
  revalidatePath('/admin/configuracoes');
  return { ok: true };
}

export async function addStaff(_prev: ConfigResult, formData: FormData): Promise<ConfigResult> {
  const { churchId } = await requireSession();

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  if (!email || !password) return { error: 'Informe e-mail e senha.' };
  if (password.length < 8) return { error: 'A senha precisa ter ao menos 8 caracteres.' };
  if (await findAdminByEmail(email)) return { error: 'Já existe uma conta com esse e-mail.' };

  await createAdmin({ churchId, email, passwordHash: await hashPassword(password), name: name || null });
  revalidatePath('/admin/configuracoes');
  return { ok: true };
}

export async function removeStaff(id: string): Promise<ConfigResult> {
  const { adminUserId, churchId } = await requireSession();
  if (id === adminUserId) return { error: 'Você não pode remover a sua própria conta.' };
  await deleteAdmin(id, churchId); // church-scoped: cannot remove another church's staff by id
  revalidatePath('/admin/configuracoes');
  return { ok: true };
}
```

- [ ] **Step 2: Texts form (client)**

`src/app/admin/(protected)/configuracoes/TextsForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { saveTexts, type ConfigResult } from './actions';

const initial: ConfigResult = {};

const FIELDS: { name: string; label: string }[] = [
  { name: 'greetingText', label: 'Saudação (primeiro contato)' },
  { name: 'menuHeaderText', label: 'Cabeçalho do menu' },
  { name: 'menuButtonLabel', label: 'Rótulo do botão do menu (ex.: Ver opções)' },
  { name: 'fallbackText', label: 'Mensagem quando não entende' },
  { name: 'unsupportedMediaText', label: 'Mensagem para áudio/figurinha/foto' },
  { name: 'errorText', label: 'Mensagem de instabilidade' },
  { name: 'prayerPromptText', label: 'Pedir o texto da oração' },
  { name: 'prayerThanksText', label: 'Agradecimento do pedido de oração' },
  { name: 'handoffText', label: 'Ao encaminhar para um atendente' },
  { name: 'handoffClosedText', label: 'Ao encerrar o atendimento' },
];

export function TextsForm({ values }: { values: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(saveTexts, initial);

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Textos do bot</h2>
      <p className="hint">Tudo o que a secretária virtual diz. Edite e salve — muda na hora.</p>

      <label htmlFor="name">Nome da igreja</label>
      <input id="name" name="name" type="text" defaultValue={values.name ?? ''} />

      {FIELDS.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name}>{f.label}</label>
          <textarea id={f.name} name={f.name} defaultValue={values[f.name] ?? ''} />
        </div>
      ))}

      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p style={{ color: 'var(--ok)' }}>Salvo! ✓</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar textos'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Credentials form (client)**

`src/app/admin/(protected)/configuracoes/CredentialsForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { saveCredentials, type ConfigResult } from './actions';

const initial: ConfigResult = {};

export function CredentialsForm({ values }: { values: { phoneNumberId: string; webhookVerifyToken: string; hasAccessToken: boolean; hasAppSecret: boolean } }) {
  const [state, formAction, pending] = useActionState(saveCredentials, initial);

  return (
    <form action={formAction} className="card">
      <h2 style={{ marginTop: 0 }}>Conexão WhatsApp (Meta)</h2>
      <p className="hint">Credenciais da API Cloud da Meta. Guardadas no banco, nunca no código.</p>

      <label htmlFor="phoneNumberId">Phone Number ID</label>
      <input id="phoneNumberId" name="phoneNumberId" type="text" defaultValue={values.phoneNumberId} />

      <label htmlFor="webhookVerifyToken">Webhook Verify Token</label>
      <input id="webhookVerifyToken" name="webhookVerifyToken" type="text" defaultValue={values.webhookVerifyToken} />

      <label htmlFor="accessToken">Access Token {values.hasAccessToken && <span className="hint">(preenchido — deixe em branco para manter)</span>}</label>
      <input id="accessToken" name="accessToken" type="password" autoComplete="off" placeholder={values.hasAccessToken ? '••••••••' : ''} />

      <label htmlFor="appSecret">App Secret {values.hasAppSecret && <span className="hint">(preenchido — deixe em branco para manter)</span>}</label>
      <input id="appSecret" name="appSecret" type="password" autoComplete="off" placeholder={values.hasAppSecret ? '••••••••' : ''} />

      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p style={{ color: 'var(--ok)' }}>Salvo! ✓</p>}
      <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? 'Salvando…' : 'Salvar credenciais'}
      </button>
    </form>
  );
}
```

> **Secret handling (now encoded in Step 1's `saveCredentials`):** `accessToken` and `appSecret` render as empty password inputs and are never sent to the browser; a blank submission keeps the stored secret rather than wiping it — the action writes those columns only when a non-empty value is entered. `phoneNumberId` and `webhookVerifyToken` are not secret and always save. The `page.tsx` props `hasAccessToken`/`hasAppSecret` are booleans derived from whether those columns are currently set.

- [ ] **Step 4: Staff manager (client)**

`src/app/admin/(protected)/configuracoes/StaffManager.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { useActionState } from 'react';
import { addStaff, removeStaff, type ConfigResult } from './actions';

const initial: ConfigResult = {};

export interface StaffRow { id: string; email: string; name: string | null; isSelf: boolean; }

export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const [state, formAction, pending] = useActionState(addStaff, initial);
  const [rowError, setRowError] = useState('');
  const [removing, startRemove] = useTransition();

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Equipe</h2>
      {staff.map((s) => (
        <div key={s.id} className="row" style={{ padding: '6px 0' }}>
          <span className="grow">{s.name || s.email} <span className="hint">{s.email}</span></span>
          {s.isSelf ? (
            <span className="hint">você</span>
          ) : (
            <button className="danger" disabled={removing} onClick={() => {
              if (!confirm(`Remover ${s.email}?`)) return;
              setRowError('');
              startRemove(async () => { const r = await removeStaff(s.id); if (r?.error) setRowError(r.error); });
            }}>Remover</button>
          )}
        </div>
      ))}
      {rowError && <p className="error">{rowError}</p>}

      <form action={formAction} style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <h3 style={{ margin: '0 0 8px' }}>Adicionar conta</h3>
        <label htmlFor="staff-name">Nome</label>
        <input id="staff-name" name="name" type="text" />
        <label htmlFor="staff-email">E-mail</label>
        <input id="staff-email" name="email" type="email" required />
        <label htmlFor="staff-password">Senha (mín. 8 caracteres)</label>
        <input id="staff-password" name="password" type="password" autoComplete="new-password" required />
        {state.error && <p className="error">{state.error}</p>}
        {state.ok && <p style={{ color: 'var(--ok)' }}>Conta adicionada! ✓</p>}
        <button className="primary" type="submit" disabled={pending} style={{ marginTop: 12 }}>
          {pending ? 'Adicionando…' : 'Adicionar'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Configurações page**

`src/app/admin/(protected)/configuracoes/page.tsx`:
```tsx
import { requireSession } from '@/lib/auth/session';
import { getChurchById } from '@/lib/repo/church-admin';
import { listAdmins } from '@/lib/repo/admin';
import { TextsForm } from './TextsForm';
import { CredentialsForm } from './CredentialsForm';
import { StaffManager, type StaffRow } from './StaffManager';

export default async function ConfiguracoesPage() {
  const { churchId, adminUserId } = await requireSession();
  const church = await getChurchById(churchId);
  if (!church) return <p className="error">Igreja não encontrada.</p>;

  const admins = await listAdmins(churchId);
  const staff: StaffRow[] = admins.map((a) => ({ id: a.id, email: a.email, name: a.name, isSelf: a.id === adminUserId }));

  const textValues: Record<string, string> = {
    name: church.name,
    greetingText: church.greetingText,
    menuHeaderText: church.menuHeaderText,
    menuButtonLabel: church.menuButtonLabel,
    fallbackText: church.fallbackText,
    unsupportedMediaText: church.unsupportedMediaText,
    errorText: church.errorText,
    prayerPromptText: church.prayerPromptText,
    prayerThanksText: church.prayerThanksText,
    handoffText: church.handoffText,
    handoffClosedText: church.handoffClosedText,
  };

  return (
    <div>
      <h1>Configurações</h1>
      <TextsForm values={textValues} />
      <CredentialsForm values={{
        phoneNumberId: church.phoneNumberId ?? '',
        webhookVerifyToken: church.webhookVerifyToken ?? '',
        hasAccessToken: !!church.accessToken,
        hasAppSecret: !!church.appSecret,
      }} />
      <StaffManager staff={staff} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/admin/configuracoes` and succeeds; all pure tests still pass (`npm test`).

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(protected)/configuracoes"
git commit -m "feat: Configurações screen — bot texts, credentials, staff accounts"
```

---

## What this plan does NOT build (Plan B)

- **Caixa de Entrada** — the human-handoff inbox; staff reading/replying to `human`-mode conversations, the 24h reply-window UI.
- **Pedidos de Oração** — reading captured prayer requests and flipping `novo` → `orado`.

Both are safe to defer: the bot-core's 24h auto-reversion prevents a member being stranded in `human` mode, and prayer requests are already captured to the database.

## Verification reality (same as bot-core)

Only the pure logic is executable here (password hashing, menu rules, validation, `isAuthenticated`). Everything DB- or HTTP-backed — repos, server actions, pages, the login flow, Blob upload — is gated by `npm run typecheck` and `npm run build` and has **never run against a real database, a real browser session, or real Vercel Blob**. First real verification happens when Neon exists: run `npm run db:seed`, then `npm run create-admin -- you@church.org <password> "Seu Nome"`, then log in and exercise each screen.

## Self-Review

**Spec coverage:** the spec's admin panel = "Conteúdo (menu editor: add/edit/reorder/hide, upload images), Configurações (church name, greeting, fallback, credentials, staff accounts)" — Conteúdo is Tasks 9–10, Configurações is Task 11, login/guard is Tasks 2–5. The 10-row cap (spec Open Question) is enforced on **both** activation (Task 9 `setItemActive`) and creation (Task 10 `createItem` saves hidden when the menu is full). Caixa de Entrada and Pedidos de Oração are explicitly Plan B. The "everything customisable / no hardcoded bot string" principle is enforced by editing `church`/`menu_item` columns throughout.

**Deliberate deviations from the spec wording (recorded so a reviewer does not read them as gaps):**
- *Reorder is up/down arrow buttons, not drag-and-drop* — the spec says "reorder (drag)". Arrow buttons are accessible and sufficient for ≤10 items; `reorderMenuItems(churchId, orderedIds)` is generic enough to back real drag later with no data change.
- *No hard-delete of menu items* — the spec frames hiding as the no-loss mechanism ("Cantata de Natal dormant for 11 months") and never asks for delete. Hiding covers every case; permanent deletion is intentionally omitted from Plan A to honour that philosophy and avoid an irreversible destructive action. Staff-account removal is kept (Configurações manages accounts) and is church-scoped.
- *Image upload is client-direct to Vercel Blob* (Task 8), not routed through a Server Action — required, because the action/request body caps (1 MB / ~4.5 MB) are smaller than a real calendar photo.

**Security review (from the adversarial pass):** every by-id mutation is church-scoped from the session — `updateMenuItem(id, churchId, …)` and `deleteAdmin(id, churchId)` filter on both id and `churchId`, so no authenticated admin can touch another church's rows (IDOR closed). Login runs exactly one bcrypt compare on every attempt (real hash, or a fixed-cost decoy when the email is unknown) so timing never reveals whether an email exists. Secrets (`accessToken`, `appSecret`) never round-trip to the browser and a blank submit keeps the stored value. `SESSION_SECRET` ≥ 32; cookie httpOnly / sameSite=lax / secure-in-prod. Every mutating action calls `requireSession()` first. The Blob upload token route authorizes on the session before minting a token.

**Placeholder scan:** no "TBD"/"TODO"/"handle later". Every code step carries complete, correct code — the secret-keeping behavior is encoded directly in Task 11's `saveCredentials`, not deferred to a note.

**Type consistency:** `SessionData`, `AdminRecord`, `ChurchRecord`, `MenuItemRow`, `ItemFormState`, `ConfigResult`, `LoginState`, `MenuListItem`, `StaffRow`, `ItemFormValues` are each defined once and consumed with matching shapes. `requireSession()` returns `{ adminUserId, churchId, name }` and every action destructures from it. `updateMenuItem(id, churchId, fields)` and `deleteAdmin(id, churchId)` carry `churchId` at every call site. `canActivateAnotherItem`/`positionsFromOrder`/`validate*` match the Interfaces Reference and their tests. `WHATSAPP_LIST_MAX_ROWS` is imported from `@/lib/whatsapp`, never redefined. The image path carries only a URL string end-to-end (`ItemForm` hidden input → `resolveImageUrl` → `imageUrl` column), never a `File` server-side.
