import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { countActiveMenuItems, listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { WHATSAPP_LIST_MAX_ROWS } from '@/lib/whatsapp';
import { MenuList, type MenuListItem } from './MenuList';

export default async function ConteudoPage() {
  const { churchId } = await requireSession();
  const rows = await listMenuItemsForAdmin(churchId);
  const active = await countActiveMenuItems(churchId);

  const items: MenuListItem[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    isActive: r.isActive,
    hasImage: !!r.imageUrl,
  }));

  return (
    <div>
      <div className="row">
        <h1 className="grow">Conteúdo do menu</h1>
        <Link className="btnlink primary" href="/admin/conteudo/novo">+ Novo item</Link>
      </div>
      <p className="hint">
        {active} de {WHATSAPP_LIST_MAX_ROWS} itens ativos. Use ▲▼ para reordenar; “Ocultar” tira do menu sem apagar o conteúdo.
        Se o menu já estiver cheio (10 ativos), um item novo é salvo como <strong>Oculto</strong> — oculte outro para ativá-lo.
      </p>
      <MenuList items={items} />
    </div>
  );
}
