import Link from 'next/link';
import { requireOwnerSession } from '@/lib/auth/owner-session';
import { ownerLogout } from './actions';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  // requireOwnerSession, not the bare cookie check: the layout wraps every owner
  // page, so putting the "does this owner account still exist?" re-check here
  // means a future page that forgets to call it still cannot render this console
  // — which holds every tenant's Meta credentials — to a deleted owner.
  const session = await requireOwnerSession();

  return (
    <div>
      <nav className="nav">
        <span className="brand">🛠️ Secretária Virtual — Proprietário</span>
        <Link href="/owner">Igrejas</Link>
        <span className="grow" />
        <span className="hint">{session.name}</span>
        <form action={ownerLogout}>
          <button type="submit">Sair</button>
        </form>
      </nav>
      <div className="container">{children}</div>
    </div>
  );
}
