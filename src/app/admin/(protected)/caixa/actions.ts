'use server';

import { revalidatePath } from 'next/cache';
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';
import { loadConversation, updateContactModeScoped } from '@/lib/repo/inbox';
import { getChurchById } from '@/lib/repo/church-admin';
import { recordOutboundMessage } from '@/lib/repo/message';
import { sendText } from '@/lib/whatsapp';
import { isReplyWindowOpen } from '@/lib/reply-window';
import { redactError } from '@/lib/redact';

export interface ReplyState {
  error?: string;
  /** Set only once the message has actually left for WhatsApp and been recorded.
   *  The reply box needs an explicit, positive signal for this: React empties the
   *  textarea on EVERY dispatch, success or failure, so "the box is empty" says
   *  nothing about whether the words were sent, and the draft mirror must not be
   *  dropped on anything weaker. See src/lib/draft.ts. */
  sent?: true;
}

export async function sendReplyToContact(
  contactId: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Escreva uma mensagem.' };

  // Only the CONTACT is read here (phone, lastInboundAt, mode) — the thread is
  // not rendered by this action. The smallest legal window keeps a send from
  // dragging the whole history back out of Postgres for nothing.
  const convo = await loadConversation(churchId, contactId, 1);
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
    // Wrapped in redactError, not logged raw — sendText's Graph API errors carry
    // Meta's raw response body, and the recipient's number is plausibly in it.
    // The message string itself stays byte-identical ('Reply send failed') so the
    // log stays greppable; only the value is wrapped. See redact.ts.
    console.error('Reply send failed', redactError(error));
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

  // revalidatePath, not redirect. A redirect to the page the form is already on
  // refreshed the thread but threw away the action's return value, leaving the
  // reply box unable to tell a successful send from a failed one — and the box
  // has to know, because that is the only safe moment to drop the saved draft.
  // This refreshes the same tree and still answers.
  revalidatePath(`/admin/caixa/${contactId}`);
  return { sent: true };
}

export async function endHandoff(contactId: string): Promise<{ error?: string }> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;
  await updateContactModeScoped(churchId, contactId, 'bot');
  revalidatePath(`/admin/caixa/${contactId}`);
  return {};
}
