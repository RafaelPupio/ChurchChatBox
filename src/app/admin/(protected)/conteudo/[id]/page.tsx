import { notFound } from 'next/navigation';
import { requireReadableSession } from '@/lib/auth/writable';
import { listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { getChurchById } from '@/lib/repo/church-admin';
import { isBehaviourKind } from '@/lib/behaviour-items';
import { ItemForm } from '../ItemForm';
import { BehaviourItemForm } from '../BehaviourItemForm';
import { editItem } from '../item-actions';

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { churchId } = await requireReadableSession();
  const items = await listMenuItemsForAdmin(churchId);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();

  const editThisItem = editItem.bind(null, id);

  if (isBehaviourKind(item.kind)) {
    // church_id-scoped, same read the Configurações page does. Quoting the reply
    // she actually sends is what answers "where did my text go" without making
    // her go and look.
    const church = await getChurchById(churchId);
    if (!church) return <p className="error">Igreja não encontrada.</p>;
    const currentText = item.kind === 'prayer' ? church.prayerPromptText : church.handoffText;

    return (
      <div>
        {/* The name is in the heading: on a phone, ten rows in, it is the only way
            to know which item you opened. */}
        <h1>Editar “{item.label}”</h1>
        {/* orphan*: whatever the OLD form stored on this row. `item` is already in
            hand, so handing her own writing back costs two props. Without them,
            deleting the fields would stop new losses and quietly strand every
            existing one — recoverable only by a human remembering to run a SELECT,
            which is not a fix, it is a hope. */}
        <BehaviourItemForm
          action={editThisItem}
          kind={item.kind}
          label={item.label}
          currentText={currentText}
          orphanBodyText={item.bodyText}
          orphanImageUrl={item.imageUrl}
        />
      </div>
    );
  }

  return (
    <div>
      <h1>Editar “{item.label}”</h1>
      <ItemForm
        action={editThisItem}
        submitLabel="Salvar"
        values={{ label: item.label, bodyText: item.bodyText, imageUrl: item.imageUrl }}
      />
    </div>
  );
}
