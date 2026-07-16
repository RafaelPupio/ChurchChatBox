# Admin Panel — Plan B: Caixa de Entrada + Pedidos de Oração Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The human side of the panel — staff read and reply to handed-off WhatsApp conversations through the church number (respecting Meta's 24-hour reply window and ending the handoff when done), and read prayer requests and mark them prayed.

**Architecture:** Next.js 15 App Router, same patterns as Plan A. Server Components render the two screens; Server Actions perform every mutation, each authenticated by `requireSession()` and scoped by the session's `churchId`. Replies go out through the church's Cloud API credentials via the existing `sendText()`; the reply is blocked (not attempted) when the 24-hour window has closed. Nothing here is a new subsystem — it wires the already-stored `message`, `contact`, and `prayer_request` rows into two screens.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · React 19 (`useActionState`) · TypeScript strict · Drizzle + Neon (existing) · Vitest

**Scope:** This is **Plan B** of the admin panel, the deferred human side. It builds on the merged bot core + admin Plan A (both on `main`). Branch this work from `main`.

## Global Constraints

- **Every mutation is authenticated and church-scoped.** Each Server Action calls `requireSession()` first; `churchId` comes from the session, never client input. Every by-id read/write filters on `church_id` too (IDOR-safe) — the bot's own `updateContactMode` is *not* church-scoped, so this plan adds a scoped variant and never calls the bot's version from the panel.
- **The panel edits no bot-output strings.** Plan B only reads conversations/prayers and sends staff-authored replies. The pt-BR text in these screens is panel chrome (labels, the window-expired message) — correct, not bot output.
- **Replies respect Meta's 24-hour window.** A business may only send a free-form message within 24h of the member's last inbound message. The reply action must **check the window and refuse to send** when it has closed, with a pt-BR explanation — never attempt a send that Meta will 400.
- **A reply is recorded only after it actually sent.** If `sendText` throws, return an error and record nothing — never log an outbound message that never left.
- **Replies use the church's stored credentials.** `phone_number_id`/`access_token` live on the `church` row and are nullable; if unset, the action returns a pt-BR "configure credentials first" error rather than throwing.
- **`drizzle-orm` stays ≥ 0.45.2.** The neon-http driver has **no transaction support** — `db.transaction()` throws.
- **Deferred live verification:** there is still no Neon database. DB/UI tasks are gated by `npm run typecheck` and `npm run build`; only the pure reply-window logic is unit-tested. Each DB/UI task's report states plainly that its DB/HTTP path never executed.
- **Language split:** product/UI strings pt-BR; code identifiers, comments, tests, docs English. Never commit `.env`. TypeScript strict. Node 20+.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/reply-window.ts` | Pure 24-hour reply-window logic — tested |
| `src/lib/repo/inbox.ts` | Conversation reads + church-scoped contact-mode write |
| `src/lib/repo/prayer-admin.ts` | Prayer-request list (joined to contact) + church-scoped status write |
| `src/app/admin/(protected)/layout.tsx` | Add the two nav links (modify) |
| `src/app/admin/(protected)/caixa/page.tsx` | Conversation list |
| `src/app/admin/(protected)/caixa/actions.ts` | `sendReplyToContact`, `endHandoff` |
| `src/app/admin/(protected)/caixa/[contactId]/page.tsx` | Conversation view + reply + end-handoff |
| `src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx` | Client reply form |
| `src/app/admin/(protected)/caixa/[contactId]/EndHandoffButton.tsx` | Client "Encerrar atendimento" |
| `src/app/admin/(protected)/oracao/page.tsx` | Prayer-request list |
| `src/app/admin/(protected)/oracao/actions.ts` | `setPrayerStatus` |
| `src/app/admin/(protected)/oracao/PrayerList.tsx` | Client status toggle |
| `src/app/globals.css` | Add conversation-thread styles (modify) |

**Routes** (all under the `(protected)` group, so guarded): `/admin/caixa`, `/admin/caixa/[contactId]`, `/admin/oracao`.

## Interfaces Reference (canonical — every task matches these exactly)

```ts
// src/lib/reply-window.ts
export const REPLY_WINDOW_MS: number;                                        // 24h
export function isReplyWindowOpen(lastInboundAt: Date | null, now: Date): boolean;
export function hoursRemaining(lastInboundAt: Date | null, now: Date): number; // whole hours, 0 when closed/null

// src/lib/repo/inbox.ts
export type MessageRecord = typeof import('@/db/schema').message.$inferSelect;
export function listConversations(churchId: string): Promise<import('@/lib/repo/contact').ContactRecord[]>; // all church contacts, most-recent first
export function loadConversation(churchId: string, contactId: string): Promise<{ contact: import('@/lib/repo/contact').ContactRecord; messages: MessageRecord[] } | null>; // church-scoped
export function updateContactModeScoped(churchId: string, contactId: string, mode: import('@/lib/types').ContactMode): Promise<void>; // church-scoped

// src/lib/repo/prayer-admin.ts
export interface PrayerRequestWithContact { id: string; text: string; status: 'novo' | 'orado'; createdAt: Date; contactName: string | null; contactPhone: string; }
export function listPrayerRequests(churchId: string): Promise<PrayerRequestWithContact[]>; // most-recent first
export function updatePrayerStatus(id: string, churchId: string, status: 'novo' | 'orado'): Promise<void>; // church-scoped

// consumed from earlier work (already on main):
// sendText(creds: { phoneNumberId: string; accessToken: string }, to: string, body: string): Promise<void>  — @/lib/whatsapp
// recordOutboundMessage(args: { churchId: string; contactId: string; body: string | null }): Promise<void>  — @/lib/repo/message
// getChurchById(churchId: string): Promise<ChurchRecord | undefined>                                         — @/lib/repo/church-admin
// requireSession(): Promise<{ adminUserId: string; churchId: string; name: string }>                          — @/lib/auth/session
```

---

### Task 1: Reply-window logic

**Files:**
- Create: `src/lib/reply-window.ts`
- Test: `tests/reply-window.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `REPLY_WINDOW_MS`, `isReplyWindowOpen(lastInboundAt, now)`, `hoursRemaining(lastInboundAt, now)`

**Note:** the window is measured from the member's **last inbound message** (`contact.lastInboundAt`), which is a distinct timestamp from the human-mode reversion window in `contact-mode.ts` (measured from `modeChangedAt`). They share the 24h duration but not the anchor — keep them separate.

- [ ] **Step 1: Write the failing test**

`tests/reply-window.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isReplyWindowOpen, hoursRemaining, REPLY_WINDOW_MS } from '@/lib/reply-window';

const now = new Date('2026-07-16T12:00:00Z');
const agoHours = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe('REPLY_WINDOW_MS', () => {
  it('is 24 hours', () => {
    expect(REPLY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isReplyWindowOpen', () => {
  it('is open one hour after the last inbound message', () => {
    expect(isReplyWindowOpen(agoHours(1), now)).toBe(true);
  });
  it('is open just under 24h', () => {
    expect(isReplyWindowOpen(agoHours(23.9), now)).toBe(true);
  });
  it('is closed at exactly 24h', () => {
    expect(isReplyWindowOpen(agoHours(24), now)).toBe(false);
  });
  it('is closed after 24h', () => {
    expect(isReplyWindowOpen(agoHours(30), now)).toBe(false);
  });
  it('is closed when the member never messaged (null)', () => {
    expect(isReplyWindowOpen(null, now)).toBe(false);
  });
});

describe('hoursRemaining', () => {
  it('reports 23 whole hours one hour in', () => {
    expect(hoursRemaining(agoHours(1), now)).toBe(23);
  });
  it('reports 0 in the final partial hour but window still open', () => {
    expect(hoursRemaining(agoHours(23.5), now)).toBe(0);
    expect(isReplyWindowOpen(agoHours(23.5), now)).toBe(true);
  });
  it('reports 0 once closed', () => {
    expect(hoursRemaining(agoHours(25), now)).toBe(0);
  });
  it('reports 0 for null', () => {
    expect(hoursRemaining(null, now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/reply-window.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/reply-window"`

- [ ] **Step 3: Implement**

`src/lib/reply-window.ts`:
```ts
/** Meta only allows a free-form reply within 24h of the member's last inbound
 *  message. Measured from contact.lastInboundAt (distinct from the human-mode
 *  reversion window in contact-mode.ts, which anchors on modeChangedAt). */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isReplyWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < REPLY_WINDOW_MS;
}

/** Whole hours left in the window; 0 when closed or never messaged. */
export function hoursRemaining(lastInboundAt: Date | null, now: Date): number {
  if (!lastInboundAt) return 0;
  const left = REPLY_WINDOW_MS - (now.getTime() - lastInboundAt.getTime());
  return left <= 0 ? 0 : Math.floor(left / (60 * 60 * 1000));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/reply-window.test.ts && npm run typecheck`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reply-window.ts tests/reply-window.test.ts
git commit -m "feat: add 24-hour WhatsApp reply-window logic"
```

---

### Task 2: Inbox and prayer-admin repositories

**Files:**
- Create: `src/lib/repo/inbox.ts`, `src/lib/repo/prayer-admin.ts`

**Interfaces:**
- Consumes: `db`; `contact`, `message`, `prayerRequest` schema; `ContactRecord` from `@/lib/repo/contact`; `ContactMode` from `@/lib/types`
- Produces: the `inbox.ts` and `prayer-admin.ts` functions in the Interfaces Reference

**No live DB.** Gate: `npm run typecheck` + existing tests stay green. These queries never execute here.

- [ ] **Step 1: Create the inbox repository**

`src/lib/repo/inbox.ts`:
```ts
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, message } from '@/db/schema';
import type { ContactRecord } from '@/lib/repo/contact';
import type { ContactMode } from '@/lib/types';

export type MessageRecord = typeof message.$inferSelect;

/** All of the church's contacts, most-recently-active first. Contacts that have
 *  talked to the bot all have lastInboundAt set. */
export async function listConversations(churchId: string): Promise<ContactRecord[]> {
  return db
    .select()
    .from(contact)
    .where(eq(contact.churchId, churchId))
    .orderBy(desc(contact.lastInboundAt));
}

/** A contact and its full message history, church-scoped. Null when the contact
 *  is not this church's. */
export async function loadConversation(
  churchId: string,
  contactId: string,
): Promise<{ contact: ContactRecord; messages: MessageRecord[] } | null> {
  const [row] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)))
    .limit(1);
  if (!row) return null;

  const messages = await db
    .select()
    .from(message)
    .where(and(eq(message.contactId, contactId), eq(message.churchId, churchId)))
    .orderBy(asc(message.createdAt));

  return { contact: row, messages };
}

/** Church-scoped contact-mode write. The bot's updateContactMode is NOT scoped;
 *  the panel must never call it — a panel action could carry any contactId. */
export async function updateContactModeScoped(
  churchId: string,
  contactId: string,
  mode: ContactMode,
): Promise<void> {
  await db
    .update(contact)
    .set({ mode, modeChangedAt: new Date() })
    .where(and(eq(contact.id, contactId), eq(contact.churchId, churchId)));
}
```

- [ ] **Step 2: Create the prayer-admin repository**

`src/lib/repo/prayer-admin.ts`:
```ts
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { contact, prayerRequest } from '@/db/schema';

export interface PrayerRequestWithContact {
  id: string;
  text: string;
  status: 'novo' | 'orado';
  createdAt: Date;
  contactName: string | null;
  contactPhone: string;
}

export async function listPrayerRequests(churchId: string): Promise<PrayerRequestWithContact[]> {
  return db
    .select({
      id: prayerRequest.id,
      text: prayerRequest.text,
      status: prayerRequest.status,
      createdAt: prayerRequest.createdAt,
      contactName: contact.name,
      contactPhone: contact.phone,
    })
    .from(prayerRequest)
    .innerJoin(contact, eq(prayerRequest.contactId, contact.id))
    .where(eq(prayerRequest.churchId, churchId))
    .orderBy(desc(prayerRequest.createdAt));
}

export async function updatePrayerStatus(
  id: string,
  churchId: string,
  status: 'novo' | 'orado',
): Promise<void> {
  await db
    .update(prayerRequest)
    .set({ status })
    .where(and(eq(prayerRequest.id, id), eq(prayerRequest.churchId, churchId)));
}
```

- [ ] **Step 3: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: typecheck 0; existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/repo/inbox.ts src/lib/repo/prayer-admin.ts
git commit -m "feat: add inbox and prayer-admin repositories (church-scoped)"
```

---

### Task 3: Caixa de Entrada — conversation list + nav links + thread styles

**Files:**
- Create: `src/app/admin/(protected)/caixa/page.tsx`
- Modify: `src/app/admin/(protected)/layout.tsx` (add two nav links)
- Modify: `src/app/globals.css` (add thread styles used by Task 4)

**Interfaces:**
- Consumes: `requireSession`; `listConversations` from `@/lib/repo/inbox`
- Produces: the `/admin/caixa` list screen; nav links to `/admin/caixa` and `/admin/oracao`

**No live DB.** Gate: `npm run typecheck && npm run build` (lists `/admin/caixa`).

- [ ] **Step 1: Add the nav links**

In `src/app/admin/(protected)/layout.tsx`, the nav currently has Conteúdo and Configurações. Add Caixa de Entrada and Pedidos de Oração between them:
```tsx
        <Link href="/admin/conteudo">Conteúdo</Link>
        <Link href="/admin/caixa">Caixa de Entrada</Link>
        <Link href="/admin/oracao">Pedidos de Oração</Link>
        <Link href="/admin/configuracoes">Configurações</Link>
```
(The `/admin/oracao` route arrives in Task 5; the link 404s until then — acceptable within this plan.)

- [ ] **Step 2: Add conversation-thread styles**

Append to `src/app/globals.css`:
```css
.thread { display: flex; flex-direction: column; gap: 6px; background: #eef2f0; border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin: 12px 0; min-height: 180px; }
.bubble { max-width: 78%; padding: 8px 11px; border-radius: 10px; line-height: 1.4; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
.bubble.in { align-self: flex-start; background: #fff; border: 1px solid var(--border); color: var(--text); }
.bubble.out { align-self: flex-end; background: #dcf8c6; color: #111; }
.conv { display: flex; align-items: center; gap: 8px; padding: 12px 14px; text-decoration: none; color: var(--text); }
.conv:hover { background: #f2f2f2; }
.mode-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.mode-human { background: #fef3c7; color: #92400e; }
.mode-bot { background: #e5e7eb; color: #374151; }
.mode-prayer { background: #ede9fe; color: #5b21b6; }
```
(These use literal colors plus the existing `--border` and `--text` tokens from Plan A's globals.css — no `--surface-2` token is defined yet, so the thread background is a literal `#eef2f0`.)

- [ ] **Step 3: Create the conversation list page**

`src/app/admin/(protected)/caixa/page.tsx`:
```tsx
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { listConversations } from '@/lib/repo/inbox';
import type { ContactMode } from '@/lib/types';

function modeTag(mode: ContactMode): { label: string; cls: string } {
  if (mode === 'human') return { label: 'Atendimento', cls: 'mode-human' };
  if (mode === 'awaiting_prayer') return { label: 'Oração', cls: 'mode-prayer' };
  return { label: 'Bot', cls: 'mode-bot' };
}

export default async function CaixaPage() {
  const { churchId } = await requireSession();
  const conversations = await listConversations(churchId);

  return (
    <div>
      <h1>Caixa de Entrada</h1>
      <p className="hint">As conversas aparecem aqui. Quem pediu atendente aparece marcado como <strong>Atendimento</strong> — abra para responder pelo número da igreja.</p>
      {conversations.length === 0 ? (
        <p className="hint">Nenhuma conversa ainda.</p>
      ) : (
        conversations.map((c) => {
          const tag = modeTag(c.mode);
          return (
            <Link key={c.id} className="card conv" href={`/admin/caixa/${c.id}`}>
              <span className="grow">
                <strong>{c.name || c.phone}</strong>
                {c.name && <span className="hint"> · {c.phone}</span>}
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

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/admin/caixa`; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(protected)/caixa/page.tsx" "src/app/admin/(protected)/layout.tsx" src/app/globals.css
git commit -m "feat: Caixa de Entrada list + nav links + thread styles"
```

---

### Task 4: Caixa de Entrada — conversation view, reply, end handoff

**Files:**
- Create: `src/app/admin/(protected)/caixa/actions.ts`, `src/app/admin/(protected)/caixa/[contactId]/page.tsx`, `src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx`, `src/app/admin/(protected)/caixa/[contactId]/EndHandoffButton.tsx`

**Interfaces:**
- Consumes: `requireSession`; `loadConversation`, `updateContactModeScoped` from `@/lib/repo/inbox`; `getChurchById` from `@/lib/repo/church-admin`; `sendText` from `@/lib/whatsapp`; `recordOutboundMessage` from `@/lib/repo/message`; `isReplyWindowOpen`, `hoursRemaining` from `@/lib/reply-window`
- Produces: the conversation screen with reply + end-handoff

**No live DB / Graph send.** Gate: `npm run typecheck && npm run build` (lists `/admin/caixa/[contactId]`). The reply/handoff never execute here.

- [ ] **Step 1: The actions**

`src/app/admin/(protected)/caixa/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { loadConversation, updateContactModeScoped } from '@/lib/repo/inbox';
import { getChurchById } from '@/lib/repo/church-admin';
import { recordOutboundMessage } from '@/lib/repo/message';
import { sendText } from '@/lib/whatsapp';
import { isReplyWindowOpen } from '@/lib/reply-window';

export interface ReplyState {
  error?: string;
}

export async function sendReplyToContact(
  contactId: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const { churchId } = await requireSession();

  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Escreva uma mensagem.' };

  const convo = await loadConversation(churchId, contactId);
  if (!convo) return { error: 'Conversa não encontrada.' };

  if (!isReplyWindowOpen(convo.contact.lastInboundAt, new Date())) {
    return { error: 'A janela de 24 horas do WhatsApp expirou. Só é possível responder até 24h após a última mensagem da pessoa.' };
  }

  const church = await getChurchById(churchId);
  if (!church?.phoneNumberId || !church.accessToken) {
    return { error: 'Configure as credenciais do WhatsApp em Configurações antes de responder.' };
  }

  try {
    await sendText({ phoneNumberId: church.phoneNumberId, accessToken: church.accessToken }, convo.contact.phone, body);
  } catch (error) {
    console.error('Reply send failed', error);
    return { error: 'Não foi possível enviar a mensagem. Tente novamente.' };
  }

  // Recorded ONLY after a successful send — never log a reply that didn't leave.
  await recordOutboundMessage({ churchId, contactId, body });

  // Slide the handoff window: the bot's 24h auto-reversion (contact-mode.ts) measures
  // from modeChangedAt, and its contract is that the panel refreshes that timestamp on
  // each staff reply — so the clock is "24h of staff INACTIVITY" (per the spec), not 24h
  // from when the handoff began. Re-set the same mode purely to bump modeChangedAt, and
  // only while in human mode so a reply during awaiting_prayer/bot never forces human mode.
  if (convo.contact.mode === 'human') {
    await updateContactModeScoped(churchId, contactId, 'human');
  }

  redirect(`/admin/caixa/${contactId}`);
}

export async function endHandoff(contactId: string): Promise<void> {
  const { churchId } = await requireSession();
  await updateContactModeScoped(churchId, contactId, 'bot');
  revalidatePath(`/admin/caixa/${contactId}`);
}
```

- [ ] **Step 2: The reply form (client)**

`src/app/admin/(protected)/caixa/[contactId]/ReplyForm.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { sendReplyToContact, type ReplyState } from '../actions';

const initial: ReplyState = {};

export function ReplyForm({ contactId, hoursRemaining }: { contactId: string; hoursRemaining: number }) {
  const action = sendReplyToContact.bind(null, contactId);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="card">
      <label htmlFor="body">Responder</label>
      <textarea id="body" name="body" required />
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint grow">⏱️ Janela de resposta: ~{hoursRemaining}h restantes</span>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: The end-handoff button (client)**

`src/app/admin/(protected)/caixa/[contactId]/EndHandoffButton.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { endHandoff } from '../actions';

export function EndHandoffButton({ contactId }: { contactId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="row" style={{ gap: 8 }}>
      {error && <span className="error">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('Encerrar o atendimento? O bot volta a responder esta pessoa.')) return;
          setError('');
          // Async transition callback so `pending` tracks the real server round-trip,
          // and the promise is awaited (not fire-and-forget) so failures surface.
          start(async () => {
            try {
              await endHandoff(contactId);
            } catch {
              setError('Não foi possível encerrar. Tente novamente.');
            }
          });
        }}
      >
        {pending ? 'Encerrando…' : '✅ Encerrar atendimento'}
      </button>
    </span>
  );
}
```

- [ ] **Step 4: The conversation page**

`src/app/admin/(protected)/caixa/[contactId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { loadConversation } from '@/lib/repo/inbox';
import { isReplyWindowOpen, hoursRemaining } from '@/lib/reply-window';
import { ReplyForm } from './ReplyForm';
import { EndHandoffButton } from './EndHandoffButton';

export default async function ConversationPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const { churchId } = await requireSession();

  const convo = await loadConversation(churchId, contactId);
  if (!convo) notFound();

  const now = new Date();
  const open = isReplyWindowOpen(convo.contact.lastInboundAt, now);
  const hrs = hoursRemaining(convo.contact.lastInboundAt, now);

  return (
    <div>
      <div className="row">
        <h1 className="grow">{convo.contact.name || convo.contact.phone}</h1>
        {convo.contact.mode === 'human' && <EndHandoffButton contactId={contactId} />}
      </div>

      <div className="thread">
        {convo.messages.length === 0 && <span className="hint">Sem mensagens.</span>}
        {convo.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>
            {m.body ?? (m.direction === 'inbound' ? '📎 mídia recebida' : '')}
          </div>
        ))}
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

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/admin/caixa/[contactId]`; existing tests unaffected.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(protected)/caixa"
git commit -m "feat: Caixa de Entrada — conversation view, reply (24h-gated), end handoff"
```

---

### Task 5: Pedidos de Oração — list and mark prayed

**Files:**
- Create: `src/app/admin/(protected)/oracao/page.tsx`, `src/app/admin/(protected)/oracao/actions.ts`, `src/app/admin/(protected)/oracao/PrayerList.tsx`

**Interfaces:**
- Consumes: `requireSession`; `listPrayerRequests`, `updatePrayerStatus` from `@/lib/repo/prayer-admin`
- Produces: the `/admin/oracao` screen

**No live DB.** Gate: `npm run typecheck && npm run build` (lists `/admin/oracao`).

- [ ] **Step 1: The action**

`src/app/admin/(protected)/oracao/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { updatePrayerStatus } from '@/lib/repo/prayer-admin';

export interface PrayerActionResult {
  error?: string;
}

export async function setPrayerStatus(id: string, status: 'novo' | 'orado'): Promise<PrayerActionResult> {
  const { churchId } = await requireSession();
  try {
    await updatePrayerStatus(id, churchId, status);
  } catch (error) {
    console.error('Prayer status update failed', error);
    return { error: 'Não foi possível atualizar o status. Tente novamente.' };
  }
  revalidatePath('/admin/oracao');
  return {};
}
```

- [ ] **Step 2: The list (client — status toggle)**

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
        <div key={p.id} className="card row">
          <span className="grow">
            “{p.text}”<span className="hint"> — {p.who} · {p.when}</span>
          </span>
          <span className={`chip ${p.status === 'orado' ? 'on' : 'off'}`}>{p.status === 'orado' ? 'Orado ✓' : 'Novo'}</span>
          <button disabled={pending} onClick={() => toggle(p.id, p.status)}>
            {p.status === 'orado' ? 'Marcar como novo' : 'Marcar como orado'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: The page**

`src/app/admin/(protected)/oracao/page.tsx`:
```tsx
import { requireSession } from '@/lib/auth/session';
import { listPrayerRequests } from '@/lib/repo/prayer-admin';
import { PrayerList, type PrayerRow } from './PrayerList';

export default async function OracaoPage() {
  const { churchId } = await requireSession();
  const requests = await listPrayerRequests(churchId);

  const prayers: PrayerRow[] = requests.map((r) => ({
    id: r.id,
    text: r.text,
    status: r.status,
    who: r.contactName || r.contactPhone,
    when: r.createdAt.toLocaleDateString('pt-BR'),
  }));

  return (
    <div>
      <h1>Pedidos de Oração</h1>
      <PrayerList prayers={prayers} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0; build lists `/admin/oracao`; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(protected)/oracao"
git commit -m "feat: Pedidos de Oração — list and mark prayed"
```

---

## What this plan completes

With Plan B merged, the admin panel covers all four screens the spec described: **Conteúdo, Configurações** (Plan A) and **Caixa de Entrada, Pedidos de Oração** (Plan B). The `human`-mode handoff now has a place for staff to answer, and prayer requests are readable and manageable in the UI instead of via SQL.

## Deliberately not built (YAGNI)

- **Unread badges / a nav count of open conversations** — the spec's core is read + reply + close; per-screen unread tracking needs a new "last read" timestamp and a query in the shared layout. Add later if staff ask.
- **A last-message preview in the conversation list** — the mockup showed one; it adds a correlated per-contact query that can't be verified without a live DB, so the list shows the contact + mode and the thread shows full history. A safe follow-up once the DB is real.

## Verification reality (same as Plan A)

Only `reply-window.ts` is executable here (pure). The repos, actions, pages, the Graph send, and the 24h enforcement have **never run against a real database, the WhatsApp API, or a browser** — gated by `npm run typecheck` and `npm run build`. First real verification: with Neon seeded and a contact in `human` mode, open `/admin/caixa`, reply, and confirm the message reaches the phone and lands in the thread; then flip a prayer request in `/admin/oracao`.

## Self-Review

**Spec coverage:** the spec's Caixa de Entrada = "conversation list + chat view; staff reply through the church number; shows the remaining 24-hour window and blocks sends once expired, with a Portuguese explanation" → Tasks 2–4 (list, thread, reply gated by `isReplyWindowOpen`, pt-BR expired message, `sendText` through the church creds, "Encerrar atendimento" via `updateContactModeScoped`). Pedidos de Oração = "list with status Novo / Orado" → Task 5. Every mutation is `requireSession()`-guarded and church-scoped.

**Sliding handoff window:** the spec's "automatic reversion after 24h of staff *inactivity*" is satisfied by `sendReplyToContact` refreshing `modeChangedAt` (via `updateContactModeScoped(churchId, contactId, 'human')`) on each staff reply while in human mode — honoring the contract the already-merged `contact-mode.ts` documents ("the panel will refresh modeChangedAt on each staff reply, sliding this window"). Without it, the clock would run from when the handoff began and the bot could resume mid-conversation.

**Placeholder scan:** none — every code step carries complete code; every command states its expected result.

**Type consistency:** `ReplyState`, `PrayerActionResult`, `PrayerRow`, `MessageRecord`, `PrayerRequestWithContact` are each defined once and consumed with matching shapes. `sendReplyToContact(contactId, prevState, formData)` is bound with `.bind(null, contactId)` in `ReplyForm` to yield the `(prevState, formData)` shape `useActionState` needs — same pattern as Plan A's `editItem`. `updateContactModeScoped`/`updatePrayerStatus`/`loadConversation` all carry `churchId` at every call site. `sendText` is called with `{ phoneNumberId, accessToken }` matching its `WhatsAppCredentials` param. `params` is awaited as a Promise in the `[contactId]` route. The reply `redirect()` sits after (outside) the `try/catch` around `sendText`, so the Next redirect signal is never swallowed.
