import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Level01', template: '%s · Level01' },
  description: 'Tarefas, finanças e organização pessoal.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg?v=level01-original-v2', apple: '/icon-192.png?v=level01-original-v2' },
  appleWebApp: { capable: true, title: 'Level01', statusBarStyle: 'default' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

export const dynamic = 'force-dynamic';
