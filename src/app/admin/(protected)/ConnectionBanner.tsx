'use client';

import { useOnline } from '@/lib/hooks/use-online';

/** Says the connection dropped, so a reply that will not send reads as "no
 *  signal" rather than "the panel is broken".
 *
 *  The wording claims nothing about work being safe. Every screen here is
 *  server-rendered from Postgres, so what is on screen is all there is: it can be
 *  read, and nothing new can be sent or saved until the network is back. */
// Return type inferred rather than annotated `JSX.Element | null`: React 19
// removed the global JSX namespace, so that annotation no longer compiles.
export function ConnectionBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <p className="offline-banner" role="status">
      📵 Sem conexão. Dá para ler o que já está na tela, mas nada será enviado ou salvo até a
      internet voltar.
    </p>
  );
}
