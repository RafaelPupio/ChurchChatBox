import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { ItemForm } from '../ItemForm';
import { editItem } from '../item-actions';

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { churchId } = await requireSession();
  const items = await listMenuItemsForAdmin(churchId);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();

  const editThisItem = editItem.bind(null, id);

  return (
    <div>
      <h1>Editar item</h1>
      <ItemForm
        action={editThisItem}
        submitLabel="Salvar alterações"
        values={{ label: item.label, bodyText: item.bodyText, kind: item.kind, imageUrl: item.imageUrl }}
      />
    </div>
  );
}
