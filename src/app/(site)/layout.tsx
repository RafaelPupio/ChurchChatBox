import type { Metadata } from 'next';

/** The public marketing surface. A route group, so it adds nothing to the URL —
 *  this is `/`, while the church panel stays at `/admin` and the vendor console
 *  at `/owner`.
 *
 *  It exists in this repo rather than as a second project because it is the same
 *  product's front door: one deploy, one domain, one certificate. That last part
 *  is not incidental — Meta's business verification wants a public site whose
 *  details match the CNPJ, and a second domain would be a second thing to verify,
 *  renew and pay for.
 *
 *  Metadata is declared here rather than inherited: the root layout titles the
 *  PANEL ("Secretária Virtual — Painel"), which is the wrong thing to show in a
 *  search result or a WhatsApp link preview for the public page. */
export const metadata: Metadata = {
  title: 'Secretária Virtual — o WhatsApp da sua igreja respondendo sozinho',
  description:
    'Uma secretária virtual no WhatsApp que responde horários, endereço, ofertas e pedidos de oração com as palavras que a sua igreja escreveu.',
  openGraph: {
    title: 'A secretária da igreja que não dorme',
    description:
      'Responde as perguntas de sempre no WhatsApp da igreja, com as palavras que vocês escreveram. Sem aplicativo para o membro baixar.',
    locale: 'pt_BR',
    type: 'website',
  },
  // No image yet, and deliberately so: the only honest image is a capture of the
  // real bot, and no outbound message has ever succeeded. A mocked-up preview
  // card would be the first thing a church sees and the first thing that is not
  // true. Add it the day the first real message sends.
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
