import { requireReadableSession } from '@/lib/auth/writable';
import { getChurchById } from '@/lib/repo/church-admin';
import { listAdmins } from '@/lib/repo/admin';
import { TextsForm } from './TextsForm';
import { ConnectionStatus } from './CredentialsForm';
import { PasswordForm } from './PasswordForm';
import { StaffManager, type StaffRow } from './StaffManager';

export default async function ConfiguracoesPage() {
  const { churchId, adminUserId } = await requireReadableSession();
  const church = await getChurchById(churchId);
  if (!church) return <p className="error">Igreja não encontrada.</p>;

  const admins = await listAdmins(churchId);
  const staff: StaffRow[] = admins.map((a) => ({ id: a.id, email: a.email, name: a.name, isSelf: a.id === adminUserId }));
  // Already church-scoped by listAdmins; this is the caller's own row.
  const me = admins.find((a) => a.id === adminUserId);

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
      {/* app_secret is part of "connected": without it the webhook cannot verify
          Meta's signature and drops every inbound message, so a church seeing
          "✓ Conectado" would still get no replies to its members. */}
      <ConnectionStatus
        connected={!!church.phoneNumberId && !!church.accessToken && !!church.appSecret}
      />
      {me && <PasswordForm email={me.email} />}
      <StaffManager staff={staff} />
    </div>
  );
}
