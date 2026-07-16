import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Secretária Virtual — Painel',
  description: 'Painel administrativo da secretária virtual da igreja.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
