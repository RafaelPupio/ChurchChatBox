import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOwnerSession, isOwnerAuthenticated } from '@/lib/auth/owner-session';
import { ownerLogout } from './actions';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getOwnerSession();
  if (!isOwnerAuthenticated(session)) {
    redirect('/owner/login');
  }

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
