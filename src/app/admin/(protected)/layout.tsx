import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { getChurchById } from '@/lib/repo/church-admin';
import { effectiveStatus } from '@/lib/church-status';
import { LogoutButton } from './LogoutButton';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isAuthenticated(session)) {
    redirect('/admin/login');
  }

  const church = session.churchId ? await getChurchById(session.churchId) : undefined;
  const status = church ? effectiveStatus(church.status, church.graceUntil, new Date()) : 'active';

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
        <LogoutButton />
      </nav>
      <div className="container">
        {status === 'suspended' && (
          <p className="error">
            Assinatura suspensa — o painel está somente leitura e o bot não está respondendo.
            Entre em contato com o suporte para reativar.
          </p>
        )}
        {status === 'past_due' && (
          <p className="warn">
            Pagamento pendente. Regularize para não interromper o atendimento aos membros.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
