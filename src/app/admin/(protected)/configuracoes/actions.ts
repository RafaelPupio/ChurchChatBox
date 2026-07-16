'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { getChurchById, updateChurch } from '@/lib/repo/church-admin';
import { createAdmin, deleteAdmin, findAdminByEmail } from '@/lib/repo/admin';
import { hashPassword } from '@/lib/auth/password';
import { validateChurchText, validateLabel } from '@/lib/validation';

export interface ConfigResult {
  error?: string;
  ok?: boolean;
}

// The bot-text columns a church always has. name uses validateLabel; the rest validateChurchText.
const TEXT_FIELDS = [
  'greetingText', 'menuHeaderText', 'menuButtonLabel', 'fallbackText',
  'unsupportedMediaText', 'errorText', 'prayerPromptText', 'prayerThanksText',
  'handoffText', 'handoffClosedText',
] as const;

export async function saveTexts(_prev: ConfigResult, formData: FormData): Promise<ConfigResult> {
  const { churchId } = await requireSession();

  const name = String(formData.get('name') ?? '').trim();
  const nameError = validateLabel(name);
  if (nameError) return { error: `Nome da igreja: ${nameError}` };

  const fields: Record<string, string> = { name };
  for (const key of TEXT_FIELDS) {
    const value = String(formData.get(key) ?? '');
    const err = validateChurchText(value);
    if (err) return { error: `Há um campo em branco. Preencha todos os textos do bot.` };
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
