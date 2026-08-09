import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { getChurchById } from '@/lib/repo/church-admin';
import { countHandoffContacts } from '@/lib/repo/inbox';
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
  /** Acknowledged rather than hidden: this read sits behind a WEAKER guard than
   *  every page does. The layout gates on getSession/isAuthenticated, not
   *  requireReadableSession, so a staffer who has been removed but whose cookie is
   *  still live sees a waiting COUNT on the tab until that cookie is rejected —
   *  one integer, no name, no phone number, no message. It is the same exposure
   *  the getChurchById call above already has, so this changes what rides on the
   *  boundary, not its shape. Not moved to the pages: the badge belongs to the tab
   *  bar and the tab bar belongs to the layout, so per-page counts would mean four
   *  fetches, four prop drills and a badge that blinks to zero on any screen that
   *  forgot one. If the trade stops being acceptable the fix is to raise THIS
   *  layout's guard, which is one call site. */
  const waiting = session.churchId ? await countHandoffContacts(session.churchId) : 0;

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

      <TabBar waiting={waiting} />

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
