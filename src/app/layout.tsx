import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Secretária Virtual — Painel',
  description: 'Painel administrativo da secretária virtual da igreja.',
  applicationName: 'Secretária Virtual',
  // capable: true is what makes an iOS home-screen launch open without the
  // browser URL bar and without the browser back button. It is only safe because
  // Part 1 gave the panel its own always-visible navigation.
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Secretária' },
  // Stops iOS turning church phone numbers in message bodies into blue call links
  // inside the thread.
  formatDetection: { telephone: false },
};

/** The ONE viewport declaration for the whole app.
 *
 *  Next already injects `width=device-width, initial-scale=1` by default, which
 *  is why the panel already lays out at true device width. Both keys are still
 *  named here so this object is complete on its own rather than depending on
 *  Next's merge order — but they are not what this export is FOR. The two
 *  additions that actually change behaviour are viewportFit and themeColor. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewportFit: 'cover' is what makes env(safe-area-inset-*) resolve to real
  // values, which the app bar and the bottom tab bar both depend on.
  viewportFit: 'cover',
  themeColor: '#075e54',
  // The Android half of the keyboard fix. 'resizes-content' asks Chrome to shrink
  // the LAYOUT viewport when the keyboard opens, so the sticky composer and the
  // fixed tab bar move up by ordinary layout and --kb correctly stays at 0px.
  // Safari ignores it, which is exactly why KeyboardInset.tsx exists for iOS.
  interactiveWidget: 'resizes-content',
  // Deliberately NOT setting maximumScale or userScalable: pinch-zoom is how an
  // older volunteer reads a small label, and taking it away is a real harm.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
