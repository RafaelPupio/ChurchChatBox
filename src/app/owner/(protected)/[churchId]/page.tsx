import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { getChurchForOwner } from '@/lib/repo/platform';
import { countMenuItems } from '@/lib/repo/menu-admin';
import { effectiveStatus } from '@/lib/church-status';
import { CredentialsForm } from './CredentialsForm';
import { PrivacyItemWarning } from './PrivacyItemWarning';
import { StatusControls } from './StatusControls';
import { UpdatePrivacyText } from './UpdatePrivacyText';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  suspended: 'Suspensa',
};

export default async function OwnerChurchPage({ params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params;
  await requireOwnerSession();

  const church = await getChurchForOwner(churchId);
  if (!church) notFound();

  const status = effectiveStatus(church.status, church.graceUntil, new Date());
  const menuItemCount = await countMenuItems(churchId);

  return (
    <div>
      <p className="hint"><Link href="/owner">← Igrejas</Link></p>
      <div className="row">
        <h1 className="grow">{church.name}</h1>
        <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
      </div>

      {menuItemCount === 0 && <PrivacyItemWarning churchId={churchId} />}
      {menuItemCount > 0 && <UpdatePrivacyText churchId={churchId} />}

      <StatusControls churchId={churchId} status={status} />

      <CredentialsForm
        churchId={churchId}
        values={{
          phoneNumberId: church.phoneNumberId ?? '',
          webhookVerifyToken: church.webhookVerifyToken ?? '',
          hasAccessToken: !!church.accessToken,
          hasAppSecret: !!church.appSecret,
        }}
      />
    </div>
  );
}
