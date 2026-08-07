import { requireSession } from '@/lib/auth/session';
import { getChurchById } from '@/lib/repo/church-admin';
import { listAdmins } from '@/lib/repo/admin';
import { TextsForm } from './TextsForm';
import { ConnectionStatus } from './CredentialsForm';
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
      <ConnectionStatus connected={!!church.phoneNumberId && !!church.accessToken} />
      <StaffManager staff={staff} />
    </div>
  );
}
