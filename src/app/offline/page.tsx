import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sem conexão — Secretária Virtual' };

/** Served by the service worker when a page navigation fails with no network.
 *
 *  Deliberately NOT under src/app/admin: it has to render with no session, no
 *  database and no network, which is precisely what requireReadableSession cannot
 *  do — and tests/privilege-boundary.test.ts would (correctly) demand that guard
 *  of any page.tsx placed there. It shows no church data, so it is safe as a
 *  public route.
 *
 *  Every style is inline. The service worker caches this document but never the
 *  hashed /_next/static CSS bundle, so an external stylesheet would not load and
 *  the page would arrive unstyled at the exact moment it needs to look reassuring. */
export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        margin: 0,
        background: '#f6f7f9',
        color: '#1f2933',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#ffffff',
          border: '1px solid #e3e6ea',
          borderRadius: 10,
          padding: 20,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 40, margin: '0 0 8px' }}>📵</p>
        <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Sem conexão</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: '0 0 8px' }}>
          O painel precisa de internet para mostrar as conversas, o menu e os pedidos de oração.
        </p>
        {/* Careful with this sentence — it is read at the one moment something has
            just gone wrong, so being wrong here is expensive in both directions.
            It must not promise safety: an earlier draft said "Nada do que você já
            enviou foi perdido", which is true of sent messages and false of a
            reply still being typed. But a flat "não fica guardado" would be wrong
            too, because ReplyForm mirrors the draft to sessionStorage, so it
            usually IS still there — and telling her it is gone makes her retype
            something she could have recovered. sessionStorage does not survive a
            relaunched standalone app, and it is unavailable outright in Safari
            private mode, so the honest word is "pode" plus somewhere to look. */}
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#6b7280', margin: '0 0 18px' }}>
          Verifique o Wi-Fi ou os dados do celular e tente de novo. As respostas que você já enviou
          chegaram normalmente. Um texto que ainda estava sendo digitado pode ter se perdido —
          confira o campo de resposta quando a conversa abrir de novo.
        </p>
        <a
          href="/admin"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: '10px 18px',
            borderRadius: 8,
            background: '#075e54',
            color: '#ffffff',
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Tentar de novo
        </a>
      </div>
    </main>
  );
}
