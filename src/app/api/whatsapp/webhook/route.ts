import { NextRequest, NextResponse } from 'next/server';
import { parseInbound } from '@/lib/inbound';
import { route } from '@/lib/menu-router';
import { effectiveMode, modeAfterUndeliveredTurn } from '@/lib/contact-mode';
import { sendReply, sendText, verifySignature } from '@/lib/whatsapp';
import { findChurchByPhoneNumberId, toChurchConfig, type ChurchRecord } from '@/lib/repo/church';
import { loadMenuItems } from '@/lib/repo/menu';
import { findOrCreateContact, markGreeted, touchLastInbound, updateContactMode } from '@/lib/repo/contact';
import { recordInboundMessage, recordOutboundMessage } from '@/lib/repo/message';
import { savePrayerRequest } from '@/lib/repo/prayer';
import { effectiveStatus } from '@/lib/church-status';

/** Meta's webhook verification handshake. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode !== 'subscribe' || !token) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // The verify token identifies the church; Meta sends no phone_number_id here.
  const { db } = await import('@/db/client');
  const { church } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const rows = await db.select().from(church).where(eq(church.webhookVerifyToken, token)).limit(1);

  if (rows.length === 0) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return new NextResponse(challenge ?? '', { status: 200 });
}

/**
 * ALWAYS returns 200. A non-200 makes Meta retry, and a retry means a real person
 * receives the same reply twice.
 */
export async function POST(request: NextRequest) {
  // Only set once the signature has been verified against this exact request body.
  // The catch block below must never message a number that came from an unverified
  // body — see notifyFailure.
  let verified: { church: ChurchRecord; to: string } | null = null;
  let suspended = false;

  try {
    // Read inside the try: even body extraction can throw (aborted connection,
    // stream error), and rule 1 is ALWAYS 200 — no exception may escape this handler.
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);
    const inbound = parseInbound(payload);

    // Delivery receipts and malformed callbacks: acknowledge, do nothing.
    if (!inbound) return NextResponse.json({ ok: true });

    // Read phone_number_id from the UNVERIFIED body only to find the church whose
    // app_secret we must check against. Nothing is acted on before verification.
    const churchRecord = await findChurchByPhoneNumberId(inbound.phoneNumberId);
    if (!churchRecord?.appSecret || !churchRecord.accessToken || !churchRecord.phoneNumberId) {
      console.error('Unknown or unconfigured church for phone_number_id', inbound.phoneNumberId);
      return NextResponse.json({ ok: true });
    }

    if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'), churchRecord.appSecret)) {
      console.error('Invalid webhook signature — rejecting payload');
      return NextResponse.json({ ok: true });
    }

    // From here on the request is authenticated: it carried a valid HMAC signed
    // with this church's app_secret, so churchRecord and inbound.from are trustworthy.
    verified = { church: churchRecord, to: inbound.from };
    suspended =
      effectiveStatus(churchRecord.status, churchRecord.graceUntil, new Date()) === 'suspended';

    const config = toChurchConfig(churchRecord);
    const creds = { phoneNumberId: churchRecord.phoneNumberId, accessToken: churchRecord.accessToken };

    const contact = await findOrCreateContact(churchRecord.id, inbound.from, inbound.name);

    // Dedupe: false means Meta re-delivered a message we already answered.
    // For a list tap, store the row's title (not the bare id) so the future admin
    // inbox can render real history instead of a blank bubble — see Finding 4.
    const isNew = await recordInboundMessage({
      churchId: churchRecord.id,
      contactId: contact.id,
      waMessageId: inbound.waMessageId,
      body:
        inbound.message.kind === 'text'
          ? inbound.message.text
          : inbound.message.kind === 'list_reply'
            ? (inbound.message.title ?? null)
            : null,
    });
    if (!isNew) return NextResponse.json({ ok: true });

    await touchLastInbound(contact.id, churchRecord.id);

    // The suspension gate used to sit HERE. It now sits below routing, because a
    // suspended church must stop SENDING, never stop RECORDING. Skipping the whole
    // router also skipped the prayer capture and the mode transitions, which lost
    // a member's prayer and left them armed to have their next ordinary message
    // filed as one.

    // Staff have 24h to pick up a `human` handoff (see contact-mode.ts). Compute
    // the effective mode here, at the edge — the router stays pure and must never
    // learn about wall-clock time — and route on THAT, not the possibly-stale
    // stored mode.
    const mode = effectiveMode(contact.mode, contact.modeChangedAt, new Date());

    // If the 24h window already lapsed, persist the reversion right away. This is
    // independent of whether today's reply succeeds below: the timeout already
    // happened, so the correction is true regardless of this message's outcome.
    // Persisting it now also means the contact isn't re-evaluated as stale forever.
    if (mode !== contact.mode) {
      await updateContactMode(contact.id, churchRecord.id, mode);
    }

    const items = await loadMenuItems(churchRecord.id);

    // Derived from a greeting that actually left, not from "we just INSERTed the
    // row". A row created while the church was suspended is a contact we have
    // never greeted, and the old derivation burned their greeting on a message
    // that was never sent — leaving them permanently stuck on the fallback text.
    const isFirstContact = contact.greetedAt === null;
    const result = route({ config, items, mode, message: inbound.message, isFirstContact });

    // ---- Facts about what the MEMBER did. True whether or not anything ships. ----

    // Deliberately BEFORE the send loop: a saved prayer whose confirmation later
    // fails to send is recoverable (staff can still see it); a prayer that was
    // never saved because a send failed first would be lost forever.
    if (result.prayerRequestText) {
      await savePrayerRequest(churchRecord.id, contact.id, result.prayerRequestText);
    }

    // The member's prayer turn ended the moment they wrote it. Persisting that
    // here — rather than after the send — is what stops their NEXT ordinary
    // message from being filed as a prayer when the confirmation was suppressed
    // (suspension) or threw. See modeAfterUndeliveredTurn for the full rule.
    const undelivered = modeAfterUndeliveredTurn(mode, result.nextMode);
    if (undelivered !== mode) {
      await updateContactMode(contact.id, churchRecord.id, undelivered);
    }

    // ---- The single exit for a silent church. Every send site is below this. ----
    // Kept as one early return rather than an `if (!suspended) { ... }` block, so
    // that "a suspended church sends nothing" stays structural: anything a future
    // contributor adds below is silenced by construction, not by remembering to
    // check. Everything that records member state has already run.
    if (suspended) {
      return NextResponse.json({ ok: true });
    }

    for (const reply of result.replies) {
      await sendReply(creds, inbound.from, reply, config, items);
      await recordOutboundMessage({
        churchId: churchRecord.id,
        contactId: contact.id,
        body: reply.type === 'menu' ? reply.bodyText : reply.body,
      });
    }

    // Only now is it true that we have said hello to this person.
    if (result.greeted) {
      await markGreeted(contact.id, churchRecord.id);
    }

    // Transitions that only make sense because the member RECEIVED something —
    // "human" for a handoff they were told about, "awaiting_prayer" for a prompt
    // they actually saw. Compared against `undelivered` (what we already
    // committed), not against `mode`. If sendReply threw above, control is in the
    // catch and none of this commits, which is the point.
    if (result.nextMode !== undelivered) {
      await updateContactMode(contact.id, churchRecord.id, result.nextMode);
    }
  } catch (error) {
    // Fail toward the human, never toward silence.
    console.error('Webhook processing failed', error);
    // verified is only set after the signature check passed for this exact
    // request. If the failure happened before that (e.g. a transient DB error
    // during the church lookup), there is no trustworthy recipient to apologize
    // to — an unverified body must never trigger an outbound message.
    // A suspended church must be completely silent — including apologies.
    if (verified && !suspended) {
      await notifyFailure(verified).catch((e) => console.error('Could not send error message', e));
    }
  }

  return NextResponse.json({ ok: true });
}

/** Best-effort apology so a broken bot never leaves a member staring at silence.
 *  Only ever called with a `verified` context, i.e. for a request whose signature
 *  was already checked against the church's app_secret — never re-derived from an
 *  unverified body. */
async function notifyFailure(verified: { church: ChurchRecord; to: string }): Promise<void> {
  const { church: churchRecord, to } = verified;
  if (!churchRecord.accessToken || !churchRecord.phoneNumberId) return;

  // Goes through whatsapp.ts's sendText — the only module allowed to talk to the
  // Graph API — so a non-2xx response (bad token, rate limit, ...) throws instead
  // of failing silently, and the caller's .catch() logs it.
  const creds = { phoneNumberId: churchRecord.phoneNumberId, accessToken: churchRecord.accessToken };
  await sendText(creds, to, churchRecord.errorText);
}
