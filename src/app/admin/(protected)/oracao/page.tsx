import { requireSession } from '@/lib/auth/session';
import { listPrayerRequests } from '@/lib/repo/prayer-admin';
import { PrayerList, type PrayerRow } from './PrayerList';

export default async function OracaoPage() {
  const { churchId } = await requireSession();
  const requests = await listPrayerRequests(churchId);

  const prayers: PrayerRow[] = requests.map((r) => ({
    id: r.id,
    text: r.text,
    status: r.status,
    who: r.contactName || r.contactPhone,
    when: r.createdAt.toLocaleDateString('pt-BR'),
  }));

  return (
    <div>
      <h1>Pedidos de Oração</h1>
      <PrayerList prayers={prayers} />
    </div>
  );
}
