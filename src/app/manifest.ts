import type { MetadataRoute } from 'next';

/** Next serves this at /manifest.webmanifest and injects the <link rel="manifest">
 *  into every page, so nothing needs to reference it by hand.
 *
 *  Colours come from the same tokens as the stylesheet: theme_color is --primary
 *  and background_color is --bg, so the splash screen and the app bar match the
 *  panel rather than approximating it. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Secretária Virtual — Painel',
    short_name: 'Secretária',
    description: 'Painel da secretária virtual da igreja no WhatsApp.',
    // /admin redirects to /admin/conteudo when signed in and to /admin/login when
    // not, so a cold launch always lands somewhere sensible.
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f7f9',
    theme_color: '#075e54',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['productivity'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android crops "any" icons to its launcher shape and will clip a cross that
      // reaches the edge; the maskable variant is drawn 20% smaller for that.
      { src: '/icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
