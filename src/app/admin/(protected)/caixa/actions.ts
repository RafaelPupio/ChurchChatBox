'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireWritableSession, blockedMessage } from '@/lib/auth/writable';
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
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;

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

export async function endHandoff(contactId: string): Promise<{ error?: string }> {
  const session = await requireWritableSession();
  if ('blocked' in session) return { error: blockedMessage(session.blocked) };
  const { churchId } = session;
  await updateContactModeScoped(churchId, contactId, 'bot');
  revalidatePath(`/admin/caixa/${contactId}`);
  return {};
}
