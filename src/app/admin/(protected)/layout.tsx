import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { getChurchById } from '@/lib/repo/church-admin';
import { effectiveStatus } from '@/lib/church-status';
import { KeyboardInset } from './KeyboardInset';
import { LogoutButton } from './LogoutButton';
import { TabBar } from './TabBar';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isAuthenticated(session)) {
    redirect('/admin/login');
  }

  const church = session.churchId ? await getChurchById(session.churchId) : undefined;
  const status = church ? effectiveStatus(church.status, church.graceUntil, new Date()) : 'active';

  return (
    <div>
      <KeyboardInset />
      {/* Identity and logout only. Destinations live in the tab bar below, which on
          a phone is pinned to the bottom of the viewport — the eight-child nav this
          replaces rendered Configurações and Sair 291px past the right edge, with
          no scrollbar to hint that they existed at all. */}
      <header className="appbar">
        <span className="brand grow">⛪ Secretária Virtual</span>
        <span className="who">{session.name}</span>
        {/* LogoutButton, not a bare <form action={logout}>: it also drops the
            sessionStorage reply drafts, which the server cannot reach. The
            secretariat phone is shared by volunteers by design, so a half-written
            pastoral reply must not outlive the session that wrote it. */}
        <LogoutButton />
      </header>

      <TabBar waiting={0} />

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
