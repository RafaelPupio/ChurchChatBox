import Link from 'next/link';
import { requireReadableSession } from '@/lib/auth/writable';
import { countActiveMenuItems, listMenuItemsForAdmin } from '@/lib/repo/menu-admin';
import { WHATSAPP_LIST_MAX_ROWS } from '@/lib/whatsapp';
import { missingBehaviourKinds } from '@/lib/behaviour-items';
import { MenuList, type MenuListItem } from './MenuList';
import { AddBehaviourItems } from './AddBehaviourItems';

export default async function ConteudoPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string }>;
}) {
  const { criado } = await searchParams;
  const { churchId } = await requireReadableSession();
  const rows = await listMenuItemsForAdmin(churchId);
  const active = await countActiveMenuItems(churchId);

  const items: MenuListItem[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    isActive: r.isActive,
    hasImage: !!r.imageUrl,
  }));

  // Looked up in the church's own rows, so an id from anywhere else simply finds
  // nothing and renders no banner. Nothing here trusts the query string.
  //
  // BOTH creators land here: the create form and the one-tap behaviour buttons.
  // That is deliberate — the buttons unmount the moment the church has both kinds,
  // so the message about what was just created cannot live in them. It lives on
  // the page, which survives the write.
  const created = criado ? rows.find((r) => r.id === criado) : undefined;
  const missing = missingBehaviourKinds(rows.map((r) => r.kind));

  return (
    <div>
      <div className="row">
        <h1 className="grow">Menu do WhatsApp</h1>
        {/* No `grow` on this link — see mobile-plan Task 4 Step 2. */}
        <Link className="btnlink primary" href="/admin/conteudo/novo">+ Adicionar ao menu</Link>
      </div>
      <p className="hint">É isto que a pessoa vê quando manda mensagem para a igreja.</p>

      {/* The three sentences that used to live here — reordering, hiding, the
          10-item ceiling — are gone. Each now appears where and when it is true:
          the ceiling on the create form and in the banner below, hiding in the
          refusal from setItemActive, and the arrows are left to speak for
          themselves. */}

      {created &&
        (created.isActive ? (
          <p className="hint" role="status">Pronto! “{created.label}” já está no menu.</p>
        ) : (
          <p className="warn" role="status">
            “{created.label}” foi salvo, mas ficou fora do menu: o WhatsApp mostra no máximo{' '}
            {WHATSAPP_LIST_MAX_ROWS} opções e as {WHATSAPP_LIST_MAX_ROWS} já estão ocupadas. Tire uma do menu e
            depois toque em “Colocar no menu” nesta opção.
          </p>
        ))}

      {active >= WHATSAPP_LIST_MAX_ROWS && (
        <p className="warn">
          O menu está cheio: {WHATSAPP_LIST_MAX_ROWS} de {WHATSAPP_LIST_MAX_ROWS} opções. Para colocar outra,
          tire uma das que estão aparecendo.
        </p>
      )}

      <MenuList items={items} />

      {missing.length > 0 && <AddBehaviourItems kinds={missing} />}
    </div>
  );
}
