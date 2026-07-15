import { NextRequest, NextResponse } from 'next/server';
import { parseInbound } from '@/lib/inbound';
import { route } from '@/lib/menu-router';
import { buildTextPayload, sendReply, verifySignature } from '@/lib/whatsapp';
import { findChurchByPhoneNumberId, toChurchConfig } from '@/lib/repo/church';
import { loadMenuItems } from '@/lib/repo/menu';
import { findOrCreateContact, touchLastInbound, updateContactMode } from '@/lib/repo/contact';
import { recordInboundMessage, recordOutboundMessage } from '@/lib/repo/message';
import { savePrayerRequest } from '@/lib/repo/prayer';

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
  // Read inside the try: even body extraction can throw (aborted connection,
  // stream error), and rule 1 is ALWAYS 200 — no exception may escape this handler.
  let rawBody = '';

  try {
    rawBody = await request.text();
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

    const config = toChurchConfig(churchRecord);
    const creds = { phoneNumberId: churchRecord.phoneNumberId, accessToken: churchRecord.accessToken };

    const { contact, isFirstContact } = await findOrCreateContact(churchRecord.id, inbound.from, inbound.name);

    // Dedupe: false means Meta re-delivered a message we already answered.
    const isNew = await recordInboundMessage({
      churchId: churchRecord.id,
      contactId: contact.id,
      waMessageId: inbound.waMessageId,
      body: inbound.message.kind === 'text' ? inbound.message.text : null,
    });
    if (!isNew) return NextResponse.json({ ok: true });

    await touchLastInbound(contact.id);

    const items = await loadMenuItems(churchRecord.id);
    const result = route({ config, items, mode: contact.mode, message: inbound.message, isFirstContact });

    if (result.prayerRequestText) {
      await savePrayerRequest(churchRecord.id, contact.id, result.prayerRequestText);
    }

    if (result.nextMode !== contact.mode) {
      await updateContactMode(contact.id, result.nextMode);
    }

    for (const reply of result.replies) {
      await sendReply(creds, inbound.from, reply, config, items);
      await recordOutboundMessage({
        churchId: churchRecord.id,
        contactId: contact.id,
        body: reply.type === 'menu' ? reply.bodyText : reply.body,
      });
    }
  } catch (error) {
    // Fail toward the human, never toward silence.
    console.error('Webhook processing failed', error);
    // No body means we never identified a church or sender — nothing to apologize to.
    if (rawBody) {
      await notifyFailure(rawBody).catch((e) => console.error('Could not send error message', e));
    }
  }

  return NextResponse.json({ ok: true });
}

/** Best-effort apology so a broken bot never leaves a member staring at silence. */
async function notifyFailure(rawBody: string): Promise<void> {
  const inbound = parseInbound(JSON.parse(rawBody));
  if (!inbound) return;

  const churchRecord = await findChurchByPhoneNumberId(inbound.phoneNumberId);
  if (!churchRecord?.accessToken || !churchRecord.phoneNumberId) return;

  await fetch(`https://graph.facebook.com/v21.0/${churchRecord.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${churchRecord.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildTextPayload(inbound.from, churchRecord.errorText)),
  });
}
