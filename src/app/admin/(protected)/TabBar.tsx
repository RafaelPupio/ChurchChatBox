'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const CAIXA = '/admin/caixa';

/** Short labels, because four tabs must fit 320px: "Configurações" needs ~81px at
 *  12px and only ~69px is available per tab. The full name is on the aria-label
 *  and, more importantly, on the destination page's own <h1>, so the tap always
 *  confirms itself.
 *
 *  `full` is therefore kept identical to the destination's <h1>, not to some
 *  prettier name for the section: a screen-reader user hears the promise on the
 *  tab and then hears it again on arrival. That is why Conteúdo's full name is
 *  "Menu do WhatsApp" — the Conteúdo pass retitled that page, and an aria-label
 *  saying anything else would announce a destination that does not exist. */
const TABS = [
  { href: '/admin/conteudo', icon: '📋', label: 'Conteúdo', full: 'Menu do WhatsApp' },
  { href: CAIXA, icon: '💬', label: 'Caixa', full: 'Caixa de Entrada' },
  { href: '/admin/oracao', icon: '🙏', label: 'Oração', full: 'Pedidos de Oração' },
  { href: '/admin/configuracoes', icon: '⚙️', label: 'Ajustes', full: 'Configurações' },
];

export function TabBar({ waiting }: { waiting: number }) {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      {TABS.map((tab) => {
        // startsWith so /admin/caixa/<id> and /admin/conteudo/novo still highlight
        // their tab — otherwise the only orientation cue disappears mid-task.
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const showBadge = tab.href === CAIXA && waiting > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            aria-label={showBadge ? `${tab.full} — ${waiting} aguardando atendimento` : tab.full}
          >
            <span className="tab-icon" aria-hidden="true">
              {tab.icon}
              {showBadge && <span className="tab-badge">{waiting > 9 ? '9+' : waiting}</span>}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
