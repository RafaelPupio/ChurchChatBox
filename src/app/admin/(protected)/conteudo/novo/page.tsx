import { requireReadableSession } from '@/lib/auth/writable';
import { ItemForm } from '../ItemForm';
import { createItem } from '../item-actions';

export default async function NovoItemPage() {
  await requireReadableSession();
  return (
    <div>
      <h1>Novo item</h1>
      <ItemForm action={createItem} submitLabel="Criar item" values={{ label: '', bodyText: '', kind: 'content', imageUrl: null }} />
    </div>
  );
}
