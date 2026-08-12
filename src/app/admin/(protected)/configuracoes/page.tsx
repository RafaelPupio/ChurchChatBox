import { requireReadableSession } from '@/lib/auth/writable';
import { getChurchById } from '@/lib/repo/church-admin';
import { listAdmins } from '@/lib/repo/admin';
import { listErasureRecords } from '@/lib/repo/erasure';
import { describeErasureRecord } from '@/lib/erasure-copy';
import { retentionCutoff } from '@/lib/retention';
import { EXPIRING_WINDOW_MS } from '@/lib/expiring-window';
import { countExpiringPrayers } from '@/lib/repo/prayer-admin';
import { TextsForm } from './TextsForm';
import { ConnectionStatus } from './CredentialsForm';
import { PasswordForm } from './PasswordForm';
import { StaffManager, type StaffRow } from './StaffManager';
import { RetentionPanel } from './RetentionPanel';
import { ExpiringWarning } from '../oracao/ExpiringWarning';

export default async function ConfiguracoesPage() {
  const { churchId, adminUserId } = await requireReadableSession();
  const church = await getChurchById(churchId);
  if (!church) return <p className="error">Igreja não encontrada.</p>;

  const admins = await listAdmins(churchId);
  const staff: StaffRow[] = admins.map((a) => ({ id: a.id, email: a.email, name: a.name, isSelf: a.id === adminUserId }));
  // Already church-scoped by listAdmins; this is the caller's own row.
  const me = admins.find((a) => a.id === adminUserId);

  const records = await listErasureRecords(churchId, 50);
  const lines = records.map(describeErasureRecord);

  const expiringBefore = new Date(retentionCutoff(new Date()).getTime() + EXPIRING_WINDOW_MS);
  const expiring = await countExpiringPrayers(churchId, expiringBefore);

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
    courtesyText: church.courtesyText,
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
      <ExpiringWarning count={expiring} />
      <RetentionPanel lines={lines} />
    </div>
  );
}
