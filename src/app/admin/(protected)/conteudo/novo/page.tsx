import { requireReadableSession } from '@/lib/auth/writable';
import { countActiveMenuItems } from '@/lib/repo/menu-admin';
import { canActivateAnotherItem } from '@/lib/menu-admin-rules';
import { ItemForm } from '../ItemForm';
import { createItem } from '../item-actions';

export default async function NovoItemPage() {
  const { churchId } = await requireReadableSession();
  const active = await countActiveMenuItems(churchId);

  return (
    <div>
      <h1>Adicionar ao menu</h1>
      {/* The 10-row cap is stated here, before she types, instead of on arrival at
          the list where it was noise — and instead of only after she submits,
          where createItem used to demote the item to hidden and say nothing. */}
      {!canActivateAnotherItem(active) && (
        <p className="warn">
          O menu já está com 10 opções aparecendo, que é o máximo do WhatsApp. Você pode criar esta agora — ela
          fica fora do menu até você tirar outra.
        </p>
      )}
      <ItemForm
        action={createItem}
        submitLabel="Adicionar ao menu"
        values={{ label: '', bodyText: '', imageUrl: null }}
      />
    </div>
  );
}
