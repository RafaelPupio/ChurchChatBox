import { requireReadableSession } from '@/lib/auth/writable';
import { EXPIRING_WINDOW_MS } from '@/lib/expiring-window';
import { retentionCutoff } from '@/lib/retention';
import { countExpiringPrayers, listPrayerRequests } from '@/lib/repo/prayer-admin';
import { ExpiringWarning } from './ExpiringWarning';
import { PrayerList, type PrayerRow } from './PrayerList';

export default async function OracaoPage() {
  const { churchId } = await requireReadableSession();
  const requests = await listPrayerRequests(churchId);

  const expiringBefore = new Date(retentionCutoff(new Date()).getTime() + EXPIRING_WINDOW_MS);
  const expiring = await countExpiringPrayers(churchId, expiringBefore);

  const prayers: PrayerRow[] = requests.map((r) => ({
    id: r.id,
    text: r.text,
    status: r.status,
    who: r.contactName || r.contactPhone,
    when: r.createdAt.toLocaleDateString('pt-BR'),
    contactId: r.contactId,
  }));

  return (
    <div>
      <h1>Pedidos de Oração</h1>
      <ExpiringWarning count={expiring} />
      <PrayerList prayers={prayers} />
    </div>
  );
}
