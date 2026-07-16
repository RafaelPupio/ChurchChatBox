import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { logout } from './actions';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isAuthenticated(session)) {
    redirect('/admin/login');
  }

  return (
    <div>
      <nav className="nav">
        <span className="brand">⛪ Secretária Virtual</span>
        <Link href="/admin/conteudo">Conteúdo</Link>
        <Link href="/admin/caixa">Caixa de Entrada</Link>
        <Link href="/admin/oracao">Pedidos de Oração</Link>
        <Link href="/admin/configuracoes">Configurações</Link>
        <span className="grow" />
        <span className="hint">{session.name}</span>
        <form action={logout}>
          <button type="submit">Sair</button>
        </form>
      </nav>
      <div className="container">{children}</div>
    </div>
  );
}
